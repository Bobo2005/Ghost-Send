// test/GhostSendWrapper.ts
//
// SCOPE OF THESE TESTS -- READ BEFORE TRUSTING A GREEN CHECKMARK
// ----------------------------------------------------------------
// Nox's confidential compute (mint/transfer/burn on encrypted balances) is
// NOT performed on-chain. NoxCompute just emits an event with a fresh,
// opaque handle; the real arithmetic happens off-chain in iExec's TEE
// runner, which watches those events on Sepolia and does the math privately.
// On a bare local Hardhat node, nothing is listening for those events, so
// no real confidential arithmetic ever happens here.
//
// To exercise wrap/transfer/unwrap/finalizeUnwrap at all locally, this file
// deploys a real NoxCompute instance and configures OURSELVES as its
// "gateway" (the role normally held by iExec's off-chain KMS/TEE service),
// so we can sign the input/decryption proofs the protocol expects.
//
// That means these tests DO verify, for real:
//   - actual ERC-20 tokens move 1:1 in wrap() and finalizeUnwrap()
//   - proof/ACL verification genuinely runs and genuinely rejects bad input
//   - the right events fire, with fresh non-zero handles, at each step
//   - unwrap requests can't be replayed
//
// These tests do NOT and CANNOT verify:
//   - that a confidential balance actually equals some expected number
//     after a mint/transfer/burn (there's no real encrypted arithmetic
//     running locally to check that against)
//
// Anywhere a plaintext amount appears in these tests for the confidential
// side (e.g. what finalizeUnwrap reveals), we chose that number ourselves
// as the stand-in "gateway" -- in production that number is computed
// honestly by the TEE, not typed in by a test file.
//
// NOTE ON ASSERTION STYLE: chai-matchers' revertedWithCustomError /
// .to.emit(...) didn't surface reverts cleanly against this project's
// EDR-simulated network (reverts came through as unhandled promise
// rejections instead of clean assertion failures). All revert/event
// checks below use plain try/catch and manual log parsing instead, which
// sidesteps whatever that mismatch is.
//
// NOTE ON EVENT ARGS: event args are read positionally (args[0], args[1],
// ...) rather than by name -- named access assumes the exact parameter
// names declared in the interface, which we've seen not always match our
// assumptions and silently returns `undefined` when it doesn't.

import { expect } from "chai";
import { network } from "hardhat";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOCAL_NOX_COMPUTE_ADDRESS = "0x75C6AF4430cc474b1bb9b8540b7E46D6f8e1C685";
const TEE_TYPE_UINT256 = 35;
const KMS_PUBLIC_KEY =
  "0x0312e1b0794046ef04bfae49938c1293fabbd6614c04862a4059d5e8a0911635c2";

function loadNoxComputeArtifact(): { abi: unknown; bytecode: string } {
  const artifactPath = path.join(
    __dirname,
    "..",
    "node_modules",
    "@iexec-nox",
    "nox-protocol-contracts",
    "artifacts",
    "contracts",
    "NoxCompute.sol",
    "NoxCompute.json",
  );
  const raw = fs.readFileSync(artifactPath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Awaits `txPromise`, expecting it to revert with the custom error
 * `errorName` defined on `contractForErrors`. Returns the error's decoded
 * args on success; throws a descriptive Error otherwise. Used instead of
 * chai-matchers' revertedWithCustomError -- see file header.
 */
async function expectCustomErrorRevert(
  txPromise: Promise<any>,
  contractForErrors: any,
  errorName: string,
): Promise<any[]> {
  try {
    const tx = await txPromise;
    await tx.wait();
  } catch (err: any) {
    const data = err?.data ?? err?.error?.data ?? err?.info?.error?.data;
    if (!data) {
      throw new Error(
        `Expected a ${errorName} revert but couldn't find error data on: ${err}`,
      );
    }
    const parsed = contractForErrors.interface.parseError(data);
    expect(
      parsed?.name,
      `expected revert ${errorName}, got ${parsed?.name ?? "unparseable error"}`,
    ).to.equal(errorName);
    return parsed!.args as unknown as any[];
  }
  throw new Error(
    `Expected transaction to revert with ${errorName}, but it succeeded`,
  );
}

describe("GhostSendWrapper", function () {
  async function deployFixture() {
    const { ethers } = await network.connect("hardhat");
    const [deployer, alice, bob] = await ethers.getSigners();

    const gatewayWallet = ethers.Wallet.createRandom().connect(ethers.provider);

    const noxComputeArtifact = loadNoxComputeArtifact();
    const NoxComputeFactory = new ethers.ContractFactory(
      noxComputeArtifact.abi as any,
      noxComputeArtifact.bytecode as string,
      deployer,
    );
    const noxComputeImpl = await NoxComputeFactory.deploy();
    await noxComputeImpl.waitForDeployment();

    const noxComputeCode = await ethers.provider.getCode(
      await noxComputeImpl.getAddress(),
    );
    await ethers.provider.send("hardhat_setCode", [
      LOCAL_NOX_COMPUTE_ADDRESS,
      noxComputeCode,
    ]);

    const noxCompute = new ethers.Contract(
      LOCAL_NOX_COMPUTE_ADDRESS,
      noxComputeArtifact.abi as any,
      deployer,
    );
    await (noxCompute as any).initialize(
      deployer.address,
      deployer.address,
      KMS_PUBLIC_KEY,
      gatewayWallet.address,
    );

    const faucetToken = await ethers.deployContract("GhostFaucetToken");
    const wrapper = await ethers.deployContract("GhostSendWrapper", [
      await faucetToken.getAddress(),
    ]);

    const chainId = (await ethers.provider.getNetwork()).chainId;

    return {
      ethers,
      deployer,
      alice,
      bob,
      gatewayWallet,
      noxCompute,
      faucetToken,
      wrapper,
      chainId,
    };
  }

  function buildExternalHandle(ethersLib: any, chainId: bigint): string {
    const bytes = new Uint8Array(32);
    bytes[0] = 0;
    const chainIdBytes = ethersLib.getBytes(
      ethersLib.zeroPadValue(ethersLib.toBeHex(chainId), 4),
    );
    bytes.set(chainIdBytes, 1);
    bytes[5] = TEE_TYPE_UINT256;
    bytes[6] = 0x01;
    bytes.set(ethersLib.randomBytes(25), 7);
    return ethersLib.hexlify(bytes);
  }

  async function signInputProof(
    ethersLib: any,
    gatewayWallet: any,
    chainId: bigint,
    handle: string,
    owner: string,
    app: string,
  ): Promise<string> {
    const latestBlock = await ethersLib.provider.getBlock("latest");
    const createdAt = BigInt(latestBlock!.timestamp);
    const domain = {
      name: "NoxCompute",
      version: "1",
      chainId,
      verifyingContract: LOCAL_NOX_COMPUTE_ADDRESS,
    };
    const types = {
      HandleProof: [
        { name: "handle", type: "bytes32" },
        { name: "owner", type: "address" },
        { name: "app", type: "address" },
        { name: "createdAt", type: "uint256" },
      ],
    };
    const signature = await gatewayWallet.signTypedData(domain, types, {
      handle,
      owner,
      app,
      createdAt,
    });
    return ethersLib.concat([
      ethersLib.zeroPadValue(owner, 20),
      ethersLib.zeroPadValue(app, 20),
      ethersLib.zeroPadValue(ethersLib.toBeHex(createdAt), 32),
      signature,
    ]);
  }

  async function signDecryptionProof(
    ethersLib: any,
    gatewayWallet: any,
    chainId: bigint,
    handle: string,
    plaintextAmount: bigint,
  ): Promise<string> {
    const decryptedResult = ethersLib.zeroPadValue(
      ethersLib.toBeHex(plaintextAmount),
      32,
    );
    const domain = {
      name: "NoxCompute",
      version: "1",
      chainId,
      verifyingContract: LOCAL_NOX_COMPUTE_ADDRESS,
    };
    const types = {
      DecryptionProof: [
        { name: "handle", type: "bytes32" },
        { name: "decryptedResult", type: "bytes" },
      ],
    };
    const signature = await gatewayWallet.signTypedData(domain, types, {
      handle,
      decryptedResult,
    });
    return ethersLib.concat([signature, decryptedResult]);
  }

  it("wrap() moves real ERC-20 tokens 1:1 and triggers a confidential mint", async function () {
    const { ethers, alice, faucetToken, wrapper, noxCompute } =
      await deployFixture();

    await faucetToken.connect(alice).mint(1000);
    const wrapAmount = ethers.parseUnits("400", 18);
    await faucetToken
      .connect(alice)
      .approve(await wrapper.getAddress(), wrapAmount);

    const aliceBefore = await faucetToken.balanceOf(alice.address);
    const wrapperBefore = await faucetToken.balanceOf(
      await wrapper.getAddress(),
    );

    const tx = await wrapper.connect(alice).wrap(alice.address, wrapAmount);
    const receipt = await tx.wait();

    expect(await faucetToken.balanceOf(alice.address)).to.equal(
      aliceBefore - wrapAmount,
    );
    expect(await faucetToken.balanceOf(await wrapper.getAddress())).to.equal(
      wrapperBefore + wrapAmount,
    );

    const mintEvent = receipt!.logs
      .map((log) => {
        try {
          return noxCompute.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "Mint");
    expect(mintEvent, "expected NoxCompute to emit Mint during wrap()").to.not
      .be.undefined;
    // Mint(caller, balanceTo, amount, totalSupply, success, newBalanceTo, newTotalSupply)
    expect(mintEvent!.args[5]).to.not.equal(ethers.ZeroHash); // newBalanceTo
  });

  it("confidentialTransfer() with a valid input proof succeeds and emits ConfidentialTransfer", async function () {
    const { ethers, alice, bob, faucetToken, wrapper, gatewayWallet, chainId } =
      await deployFixture();
    const wrapperAddress = await wrapper.getAddress();

    await faucetToken.connect(alice).mint(1000);
    const wrapAmount = ethers.parseUnits("400", 18);
    await faucetToken.connect(alice).approve(wrapperAddress, wrapAmount);
    await wrapper.connect(alice).wrap(alice.address, wrapAmount);

    const handle = buildExternalHandle(ethers, chainId);
    const proof = await signInputProof(
      ethers,
      gatewayWallet,
      chainId,
      handle,
      alice.address,
      wrapperAddress,
    );

    const tx = await wrapper
      .connect(alice)
      ["confidentialTransfer(address,bytes32,bytes)"](
        bob.address,
        handle,
        proof,
      );
    const receipt = await tx.wait();

    const transferEvent = receipt!.logs
      .map((log) => {
        try {
          return wrapper.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "ConfidentialTransfer");
    expect(transferEvent, "expected a ConfidentialTransfer event").to.not.be
      .undefined;
    // ConfidentialTransfer(from, to, amount)
    expect(transferEvent!.args[0]).to.equal(alice.address);
    expect(transferEvent!.args[1]).to.equal(bob.address);
  });

  it("unwrap() then finalizeUnwrap() burns confidentially and pays out real ERC-20 tokens", async function () {
    const { ethers, bob, faucetToken, wrapper, gatewayWallet, chainId } =
      await deployFixture();
    const wrapperAddress = await wrapper.getAddress();

    await faucetToken.connect(bob).mint(1000);
    const wrapAmount = ethers.parseUnits("250", 18);
    await faucetToken.connect(bob).approve(wrapperAddress, wrapAmount);
    await wrapper.connect(bob).wrap(bob.address, wrapAmount);

    const bobBeforeUnwrap = await faucetToken.balanceOf(bob.address);
    const wrapperBeforeUnwrap = await faucetToken.balanceOf(wrapperAddress);

    const handle = buildExternalHandle(ethers, chainId);
    const proof = await signInputProof(
      ethers,
      gatewayWallet,
      chainId,
      handle,
      bob.address,
      wrapperAddress,
    );

    const unwrapTx = await wrapper
      .connect(bob)
      ["unwrap(address,address,bytes32,bytes)"](
        bob.address,
        bob.address,
        handle,
        proof,
      );
    const unwrapReceipt = await unwrapTx.wait();

    const unwrapRequestedEvent = unwrapReceipt!.logs
      .map((log) => {
        try {
          return wrapper.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "UnwrapRequested");
    expect(unwrapRequestedEvent, "expected an UnwrapRequested event").to.not
      .be.undefined;

    // UnwrapRequested(to, unwrapAmount) -- unwrapAmount (the request id) is arg[1]
    const unwrapRequestId: string = String(unwrapRequestedEvent!.args[1]);

    expect(await wrapper.unwrapRequester(unwrapRequestId)).to.equal(
      bob.address,
    );

    const decryptedAmountAndProof = await signDecryptionProof(
      ethers,
      gatewayWallet,
      chainId,
      unwrapRequestId,
      wrapAmount,
    );

    const finalizeTx = await wrapper.finalizeUnwrap(
      unwrapRequestId,
      decryptedAmountAndProof,
    );
    const finalizeReceipt = await finalizeTx.wait();

    const finalizedEvent = finalizeReceipt!.logs
      .map((log) => {
        try {
          return wrapper.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "UnwrapFinalized");
    expect(finalizedEvent, "expected an UnwrapFinalized event").to.not.be
      .undefined;
    // UnwrapFinalized(to, unwrapRequestId, plaintextAmount)
    expect(finalizedEvent!.args[0]).to.equal(bob.address);
    expect(finalizedEvent!.args[1]).to.equal(unwrapRequestId);
    expect(finalizedEvent!.args[2]).to.equal(wrapAmount);

    expect(await faucetToken.balanceOf(bob.address)).to.equal(
      bobBeforeUnwrap + wrapAmount,
    );
    expect(await faucetToken.balanceOf(wrapperAddress)).to.equal(
      wrapperBeforeUnwrap - wrapAmount,
    );

    expect(await wrapper.unwrapRequester(unwrapRequestId)).to.equal(
      ethers.ZeroAddress,
    );

    await expectCustomErrorRevert(
      wrapper.finalizeUnwrap(unwrapRequestId, decryptedAmountAndProof, {
        gasLimit: 2_000_000,
      }),
      wrapper,
      "InvalidUnwrapRequest",
    );
  });

  it("unwrap() reverts if the caller isn't the token owner or an approved operator", async function () {
    const { ethers, alice, bob, faucetToken, wrapper, gatewayWallet, chainId } =
      await deployFixture();
    const wrapperAddress = await wrapper.getAddress();

    await faucetToken.connect(alice).mint(1000);
    const wrapAmount = ethers.parseUnits("100", 18);
    await faucetToken.connect(alice).approve(wrapperAddress, wrapAmount);
    await wrapper.connect(alice).wrap(alice.address, wrapAmount);

    const handle = buildExternalHandle(ethers, chainId);
    const proof = await signInputProof(
      ethers,
      gatewayWallet,
      chainId,
      handle,
      bob.address,
      wrapperAddress,
    );

    await expectCustomErrorRevert(
      wrapper
        .connect(bob)
        ["unwrap(address,address,bytes32,bytes)"](
          alice.address,
          bob.address,
          handle,
          proof,
          { gasLimit: 2_000_000 },
        ),
      wrapper,
      "ERC7984UnauthorizedSpender",
    );
  });

  it("confidentialTransfer() reverts on a malformed input proof", async function () {
    const { ethers, alice, bob, wrapper, noxCompute, chainId } =
      await deployFixture();
    const handle = buildExternalHandle(ethers, chainId);
    const tooShortProof = "0x" + "00".repeat(10);

    await expectCustomErrorRevert(
      wrapper
        .connect(alice)
        ["confidentialTransfer(address,bytes32,bytes)"](
          bob.address,
          handle,
          tooShortProof,
          { gasLimit: 2_000_000 },
        ),
      noxCompute,
      "InvalidProof",
    );
  });
});