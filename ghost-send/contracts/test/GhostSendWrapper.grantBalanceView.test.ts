// test/GhostSendWrapper.grantBalanceView.test.ts
//
// Tests for GhostSendWrapper.grantBalanceView() -- the additive view-access
// feature. Uses the same local-testing setup as GhostSendWrapper.test.ts
// (deploying a real NoxCompute instance and initializing it ourselves,
// since real confidential compute only runs off-chain on a live network --
// see that file's header for the full explanation).
//
// SCOPE: "CAN view" / "CANNOT view" here means "is authorized by
// NoxCompute's own ACL to decrypt the handle" (checked via NoxCompute's
// isViewer()), not an actual off-chain KMS decrypt call. Performing a real
// decrypt requires off-chain infrastructure this test suite has no way to
// invoke -- the same honest boundary already documented for
// finalizeUnwrap's proof elsewhere in this project. isViewer() is the
// real, on-chain, authoritative answer to "would a decrypt attempt by this
// address actually be allowed."

import { expect } from "chai";
import { network } from "hardhat";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOCAL_NOX_COMPUTE_ADDRESS = "0x75C6AF4430cc474b1bb9b8540b7E46D6f8e1C685";
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

describe("GhostSendWrapper: grantBalanceView", function () {
  async function deployFixture() {
    const { ethers } = await network.connect("hardhat");
    const [deployer, alice, bob, mallory] = await ethers.getSigners();

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

    return {
      ethers,
      deployer,
      alice,
      bob,
      mallory,
      noxCompute,
      faucetToken,
      wrapper,
    };
  }

  it("grants the chosen viewer real, on-chain decrypt authorization", async function () {
    const { ethers, alice, bob, faucetToken, wrapper, noxCompute } =
      await deployFixture();
    const wrapperAddress = await wrapper.getAddress();

    await faucetToken.connect(alice).mint(1000);
    const wrapAmount = ethers.parseUnits("100", 18);
    await faucetToken.connect(alice).approve(wrapperAddress, wrapAmount);
    await wrapper.connect(alice).wrap(alice.address, wrapAmount);

    const balanceHandle = await wrapper.confidentialBalanceOf(alice.address);

    const tx = await wrapper.connect(alice).grantBalanceView(bob.address);
    const receipt = await tx.wait();

    const grantedEvent = receipt!.logs
      .map((log) => {
        try {
          return wrapper.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "ViewAccessGranted");
    expect(grantedEvent, "expected a ViewAccessGranted event").to.not.be
      .undefined;
    // Read by position, not name -- ViewAccessGranted(address indexed owner, address indexed viewer)
    expect(grantedEvent!.args[0]).to.equal(alice.address);
    expect(grantedEvent!.args[1]).to.equal(bob.address);

    // The real, authoritative check: NoxCompute's own ACL now allows Bob
    // to view/decrypt Alice's balance handle.
    expect(await noxCompute.isViewer(balanceHandle, bob.address)).to.equal(
      true,
    );
  });

  it("does not grant view access to an address that was never granted it", async function () {
    const { ethers, alice, mallory, faucetToken, wrapper, noxCompute } =
      await deployFixture();
    const wrapperAddress = await wrapper.getAddress();

    await faucetToken.connect(alice).mint(1000);
    const wrapAmount = ethers.parseUnits("100", 18);
    await faucetToken.connect(alice).approve(wrapperAddress, wrapAmount);
    await wrapper.connect(alice).wrap(alice.address, wrapAmount);

    const balanceHandle = await wrapper.confidentialBalanceOf(alice.address);

    // No grantBalanceView call for mallory at all.
    expect(
      await noxCompute.isViewer(balanceHandle, mallory.address),
    ).to.equal(false);
  });

  it("reverts when granting view access to the zero address", async function () {
  const { ethers, alice, faucetToken, wrapper } = await deployFixture();
  const wrapperAddress = await wrapper.getAddress();

  await faucetToken.connect(alice).mint(1000);
  const wrapAmount = ethers.parseUnits("50", 18);
  await faucetToken.connect(alice).approve(wrapperAddress, wrapAmount);
  await wrapper.connect(alice).wrap(alice.address, wrapAmount);

  let didRevert = false;
  try {
    const tx = await wrapper
      .connect(alice)
      .grantBalanceView(ethers.ZeroAddress, { gasLimit: 200_000 });
    await tx.wait();
  } catch (err) {
    didRevert = true;
    // Sanity-check it's actually our require() message, not some
    // unrelated failure masquerading as a revert.
    expect(String(err)).to.include("Ghost Send: zero address");
  }
  expect(didRevert, "expected grantBalanceView to revert on the zero address")
    .to.equal(true);
});
});