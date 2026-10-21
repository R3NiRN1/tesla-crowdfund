// hardhat.config.ts
import { configVariable, defineConfig } from "hardhat/config";
import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import { fileURLToPath } from "node:url";

import * as dotenv from "dotenv";
dotenv.config();

const v2CompilerSettings = {
  evmVersion: "paris" as const,
  optimizer: {
    enabled: true,
    runs: 200,
  },
};

const solcPath = fileURLToPath(new URL("./node_modules/solc/soljson.js", import.meta.url));

export default defineConfig({
  plugins: [hardhatNodeTestRunner, hardhatViem],
  // Preserve the historical V1 compiler behaviour by default. V2 is explicitly
  // optimized because CampaignFactoryV2 embeds CampaignV2 creation bytecode and
  // must remain below the EVM deployed-code-size limit on BSC/mainnet-compatible EVMs.
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        path: solcPath,
        settings: {
          evmVersion: "paris",
        },
      },
    ],
    overrides: {
      "contracts/CampaignV2.sol": {
        version: "0.8.20",
        path: solcPath,
        settings: v2CompilerSettings,
      },
      "contracts/CampaignFactoryV2.sol": {
        version: "0.8.20",
        path: solcPath,
        settings: v2CompilerSettings,
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
    },
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    bscTestnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("BSC_TESTNET_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 97,
    },
    bscMainnet: {
      type: "http",
      chainType: "l1",
      url: configVariable("BSC_MAINNET_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      chainId: 56,
    },
  },
});
