import { publicClient } from "./publicClient";
import { factoryAbi } from "./factoryAbi";

export const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;

export async function readFactoryIndex() {
  const [count, token] = await Promise.all([
    publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "campaignCount" }),
    publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "token" }),
  ]);

  const n = Number(count);

  const addresses = await Promise.all(
    [...Array(n)].map((_, i) =>
      publicClient.readContract({
        address: FACTORY,
        abi: factoryAbi,
        functionName: "campaigns",
        args: [BigInt(i)],
      })
    )
  );

  return { token, addresses: addresses as `0x${string}`[] };
}
