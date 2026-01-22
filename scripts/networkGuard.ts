import { network } from "hardhat";

const BSC_MAINNET_CHAIN_ID = 56;
const BSC_TESTNET_CHAIN_ID = 97;

export function assertBscChainId() {
  const actualChainId = network.config.chainId;

  if (network.name === "bscMainnet") {
    if (actualChainId !== BSC_MAINNET_CHAIN_ID) {
      throw new Error(
        `Network guard: expected chainId ${BSC_MAINNET_CHAIN_ID} for bscMainnet, got ${actualChainId}. Switch network or update hardhat.config.ts.`
      );
    }
  }

  if (network.name === "bscTestnet") {
    if (actualChainId !== BSC_TESTNET_CHAIN_ID) {
      throw new Error(
        `Network guard: expected chainId ${BSC_TESTNET_CHAIN_ID} for bscTestnet, got ${actualChainId}. Switch network or update hardhat.config.ts.`
      );
    }
  }
}

export function assertMainnetConfirmation() {
  if (network.name === "bscMainnet" && process.env.CONFIRM_MAINNET !== "yes") {
    throw new Error("Mainnet action blocked. Set CONFIRM_MAINNET=yes to proceed.");
  }
}
