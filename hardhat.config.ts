// hardhat.config.ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";

import * as dotenv from "dotenv";
dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const BSC_TESTNET_RPC_URL = process.env.BSC_TESTNET_RPC_URL || "";
const BSC_MAINNET_RPC_URL = process.env.BSC_MAINNET_RPC_URL || "";

const v2CompilerSettings = {
  optimizer: {
    enabled: true,
    runs: 200,
  },
};

const config: HardhatUserConfig = {
  // Preserve the historical V1 compiler behaviour by default. V2 is explicitly
  // optimized because CampaignFactoryV2 embeds CampaignV2 creation bytecode and
  // must remain below the EVM deployed-code-size limit on BSC/mainnet-compatible EVMs.
  solidity: {
    compilers: [
      {
        version: "0.8.20",
      },
    ],
    overrides: {
      "contracts/CampaignV2.sol": {
        version: "0.8.20",
        settings: v2CompilerSettings,
      },
      "contracts/CampaignFactoryV2.sol": {
        version: "0.8.20",
        settings: v2CompilerSettings,
      },
    },
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    bscTestnet: {
      url: BSC_TESTNET_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 97,
    },
    bscMainnet: {
      url: BSC_MAINNET_RPC_URL,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 56,
    },
  },
};

export default config;
