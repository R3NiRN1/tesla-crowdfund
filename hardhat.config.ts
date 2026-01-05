// hardhat.config.ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";

import * as dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const BSC_TESTNET_RPC = process.env.BSC_TESTNET_RPC || "";

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    bsctest: {
      url: BSC_TESTNET_RPC,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 97,
    },
  },
};

export default config;
