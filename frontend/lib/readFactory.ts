import { getPublicClient } from "./publicClient";
import { factoryAbi } from "./factoryAbi";
import { getPublicConfig, ZERO_ADDRESS } from "./publicConfig";
import { getStoredConfig } from "./storedConfig";

export const EXPECTED_FACTORY_VERSION = "2.0.0-alpha";

function getFactoryAddress() {
  const storedConfig = typeof window === "undefined" ? null : getStoredConfig();
  return getPublicConfig(storedConfig).factoryAddress as `0x${string}`;
}

export async function readFactoryIndex() {
  const factoryAddress = getFactoryAddress();
  const publicClient = getPublicClient();

  if (!factoryAddress || factoryAddress.toLowerCase() === ZERO_ADDRESS) {
    return { addresses: [], token: ZERO_ADDRESS, arbitrator: ZERO_ADDRESS, version: null };
  }

  const [version, campaignCount, token, arbitrator] = await Promise.all([
    publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "CONTRACT_VERSION" }),
    publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "campaignCount" }),
    publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "token" }),
    publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "arbitrator" }),
  ]);

  if (version !== EXPECTED_FACTORY_VERSION) {
    throw new Error(`Configured factory reports ${version || "no version"}; expected CampaignFactoryV2 ${EXPECTED_FACTORY_VERSION}. Writes remain disabled.`);
  }

  const n = Number(campaignCount);
  const addresses = await Promise.all(
    [...Array(n)].map(async (_, i) => {
      return publicClient.readContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "campaigns",
        args: [BigInt(i)],
      });
    }),
  );

  return {
    addresses: addresses as `0x${string}`[],
    token: token as `0x${string}`,
    arbitrator: arbitrator as `0x${string}`,
    version,
  };
}
