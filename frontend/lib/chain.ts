import { defineChain } from "viem";
import { getPublicConfig } from "./publicConfig";

const fallback = {
  56: {
    rpcUrl: "https://bsc-dataseed.binance.org",
    explorer: "https://bscscan.com",
  },
  97: {
    rpcUrl: "https://bsc-testnet.publicnode.com",
    explorer: "https://testnet.bscscan.com",
  },
};

export function getBscChain() {
  const publicConfig = getPublicConfig();
  const resolvedChainId = publicConfig.chainId === 56 ? 56 : 97;
  const isMainnet = resolvedChainId === 56;
  const fallbackConfig = fallback[resolvedChainId];

  return defineChain({
    id: resolvedChainId,
    name: isMainnet ? "BSC Mainnet" : "BSC Testnet",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: {
      default: { http: [publicConfig.rpcUrl || fallbackConfig.rpcUrl] },
      public: { http: [publicConfig.rpcUrl || fallbackConfig.rpcUrl] },
    },
    blockExplorers: {
      default: { name: "BscScan", url: publicConfig.bscscanBase || fallbackConfig.explorer },
    },
  });
}
