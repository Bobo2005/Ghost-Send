import { network } from "hardhat";

// Your deployed faucet token address
const FAUCET_TOKEN_ADDRESS = "0x13b090ba5D6049ddFeEf34267194085eBE804AAD";

async function main() {
  const { ethers } = await network.connect();

  const [signer] = await ethers.getSigners();
  console.log("Using account:", signer.address);

  const faucet = await ethers.getContractAt(
    "GhostFaucetToken",
    FAUCET_TOKEN_ADDRESS,
    signer,
  );

  const symbol = await faucet.symbol();
  const decimals = await faucet.decimals();

  const balanceBefore = await faucet.balanceOf(signer.address);
  console.log(
    `Balance before: ${ethers.formatUnits(balanceBefore, decimals)} ${symbol}`,
  );

  // Mint 100 tokens (adjust this amount if your mint cap is different)
  const mintAmount = ethers.parseUnits("100", decimals);

  console.log(`Minting ${ethers.formatUnits(mintAmount, decimals)} ${symbol}...`);
  const tx = await faucet.mint(mintAmount);
  console.log("Tx sent:", tx.hash);

  const receipt = await tx.wait();
  console.log("Confirmed in block:", receipt?.blockNumber);

  const balanceAfter = await faucet.balanceOf(signer.address);
  console.log(
    `Balance after: ${ethers.formatUnits(balanceAfter, decimals)} ${symbol}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});