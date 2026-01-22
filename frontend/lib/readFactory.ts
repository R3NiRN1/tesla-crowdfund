import { getPublicClient } from "./publicClient";
import { factoryAbi } from "./factoryAbi";
import { getPublicConfig, ZERO_ADDRESS } from "./publicConfig";

export function getFactoryAddress() {
  return getPublicConfig().factoryAddress as `0x${string}`;
}

export async function readFactoryIndex() {
  const factoryAddress = getFactoryAddress();
  if (factoryAddress.toLowerCase() === ZERO_ADDRESS) {
    return { token: ZERO_ADDRESS as `0x${string}`, addresses: [] };
  }
  const publicClient = getPublicClient();
  const [count, token] = await Promise.all([
    publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "campaignCount" }),
    publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "token" }),
  ]);

  const n = Number(count);

  const addresses = await Promise.all(
    [...Array(n)].map((_, i) =>
      publicClient.readContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "campaigns",
        args: [BigInt(i)],
      })
    )
  );

  return { token, addresses: addresses as `0x${string}`[] };
}
