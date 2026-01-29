import { getPublicClient } from "./publicClient";
import { factoryAbi } from "./factoryAbi";
import { getPublicConfig, ZERO_ADDRESS } from "./publicConfig";
import { getStoredConfig } from "./storedConfig";

function getFactoryAddress() {
  const storedConfig = typeof window === "undefined" ? null : getStoredConfig();
  return getPublicConfig(storedConfig).factoryAddress as `0x${string}`;
}

export async function readFactoryIndex() {
  const factoryAddress = getFactoryAddress();
  const publicClient = getPublicClient();

  if (!factoryAddress || factoryAddress.toLowerCase() === ZERO_ADDRESS) {
    return { addresses: [], token: ZERO_ADDRESS };
  }

  const [campaignCount, token] = await Promise.all([
    publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "campaignCount" }),
    publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "token" }),
  ]);

  const n = Number(campaignCount);
  const addresses = await Promise.all(
    [...Array(n)].map(async (_, i) => {
      return publicClient.readContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "campaigns",
        args: [BigInt(i)],
      });
    })
  );

  return { addresses: addresses as `0x${string}`[], token: token as `0x${string}` };
}
