// frontend/lib/publicClient.ts
import { createPublicClient, http, defineChain } from "viem";
import { getPublicConfig } from "./publicConfig";

const fallbackChainId = 97;
const fallbackRpcUrl = "https://bsc-testnet.publicnode.com";

export function getPublicClient() {
  const publicConfig = getPublicConfig();
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
