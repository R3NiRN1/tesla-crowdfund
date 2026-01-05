// frontend/lib/publicClient.ts
import { createPublicClient, http, defineChain } from "viem";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "97");

// Minimal BSC testnet chain config (works fine for readContract)
export const bsc = defineChain({
  id: chainId,
  name: chainId === 97 ? "BSC Testnet" : "BSC",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_URL ||
          "https://bsc-testnet.publicnode.com",
      ],
    },
  },
});

export const publicClient = createPublicClient({
  chain: bsc,
  transport: http(
    process.env.NEXT_PUBLIC_RPC_URL || "https://bsc-testnet.publicnode.com"
  ),
});
