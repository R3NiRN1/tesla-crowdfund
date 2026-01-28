import { ethers, network } from "hardhat";

const MAINNET_CHAIN_ID = 56;
const MAINNET_CONFIRM_VALUE = "YES";

export async function assertNetworkSafety(actionLabel: string) {
  const expectedChainId = network.config.chainId;
  const actualChainId = (await ethers.provider.getNetwork()).chainId;
  console.log(
    `${actionLabel}: Hardhat network=${network.name}, expectedChainId=${
      typeof expectedChainId === "number" ? expectedChainId : "unknown"
    }, actualChainId=${actualChainId}`
  );

  if (typeof expectedChainId === "number" && actualChainId !== expectedChainId) {
    throw new Error(
      `${actionLabel}: RPC chainId ${actualChainId} does not match configured ${expectedChainId} for ${network.name}.`
    );
  }

  const confirm = process.env.CONFIRM_MAINNET;
  if (actualChainId === MAINNET_CHAIN_ID && confirm !== MAINNET_CONFIRM_VALUE) {
    throw new Error(
      `Mainnet action blocked. Set CONFIRM_MAINNET=${MAINNET_CONFIRM_VALUE} to proceed.`
    );
  }

  return { actualChainId, expectedChainId: typeof expectedChainId === "number" ? expectedChainId : null };
}
