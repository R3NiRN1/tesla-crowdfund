// frontend/lib/publicClient.ts
import { createPublicClient, http, defineChain } from "viem";
import { getPublicConfig } from "./publicConfig";
import { getStoredConfig } from "./storedConfig";

const fallbackChainId = 97;
const fallbackRpcUrl = "https://bsc-testnet.publicnode.com";

export function getPublicClient() {
  const storedConfig = typeof window === "undefined" ? null : getStoredConfig();
  const publicConfig = getPublicConfig(storedConfig);
  const chainId = publicConfig.chainId ?? fallbackChainId;

  const bsc = defineChain({
    id: chainId,
    name: chainId === 97 ? "BSC Testnet" : "BSC",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: {
      default: {
        http: [publicConfig.rpcUrl || fallbackRpcUrl],
      },
    },
  });

  return createPublicClient({
    chain: bsc,
    transport: http(publicConfig.rpcUrl || fallbackRpcUrl),
  });
}
