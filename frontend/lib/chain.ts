import { defineChain } from "viem";
import { getPublicConfig } from "./publicConfig";

const fallbackRpcUrl = "https://bsc-testnet.publicnode.com";
const fallbackExplorer = "https://testnet.bscscan.com";

export function getBscTestnetChain() {
  const publicConfig = getPublicConfig();
  return defineChain({
    id: 97,
    name: "BSC Testnet",
    nativeCurrency: { name: "BNB", symbol: "tBNB", decimals: 18 },
    rpcUrls: {
      default: { http: [publicConfig.rpcUrl || fallbackRpcUrl] },
      public: { http: [publicConfig.rpcUrl || fallbackRpcUrl] },
    },
    blockExplorers: {
      default: { name: "BscScan", url: publicConfig.bscscanBase || fallbackExplorer },
    },
  });
}
