

// // const RPC_URL = process.env.RPC_URL ?? ""; 
 
import "dotenv/config";
import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
console.log("RPC_URL type:", typeof RPC_URL, "| length:", RPC_URL.length, "| starts with:", RPC_URL.slice(0, 8));
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthers],
  defaultNetwork: "hardhat",
  solidity: {
    profiles: {
      default: {
        version: "0.8.35",
      },
      production: {
        version: "0.8.35",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
      allowUnlimitedContractSize: true,
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: RPC_URL,
      chainId: 11155111,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  verify: {
    etherscan: {
      apiKey: ETHERSCAN_API_KEY,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
  },
};

export default config;