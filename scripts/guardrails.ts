import { network } from "hardhat";

const MAINNET_CHAIN_ID = 56;
const MAINNET_CONFIRM_VALUE = "YES";

export async function assertNetworkSafety(actionLabel: string) {
  const connection = await network.connect();
  const publicClient = await connection.viem.getPublicClient();
  const expectedChainId = connection.networkConfig.chainId;
  const actualChainId = await publicClient.getChainId();
  console.log(
    `${actionLabel}: Hardhat network=${connection.networkName}, expectedChainId=${
      typeof expectedChainId === "number" ? expectedChainId : "unknown"
    }, actualChainId=${actualChainId}`
  );

  if (typeof expectedChainId === "number" && actualChainId !== expectedChainId) {
    throw new Error(
      `${actionLabel}: RPC chainId ${actualChainId} does not match configured ${expectedChainId} for ${connection.networkName}.`
    );
  }

  const confirm = process.env.CONFIRM_MAINNET;
  if (actualChainId === MAINNET_CHAIN_ID && confirm !== MAINNET_CONFIRM_VALUE) {
    throw new Error(
      `Mainnet action blocked. Set CONFIRM_MAINNET=${MAINNET_CONFIRM_VALUE} to proceed.`
    );
  }

  return {
    actualChainId,
    connection,
    networkName: connection.networkName,
    publicClient,
    viem: connection.viem,
    expectedChainId: typeof expectedChainId === "number" ? expectedChainId : null,
  };
}
