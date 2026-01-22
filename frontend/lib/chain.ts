import { defineChain } from "viem";

export const targetChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "97");
export const targetRpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ||
  (targetChainId === 56
    ? "https://bsc-dataseed.binance.org/"
    : "https://bsc-testnet.publicnode.com");
export const targetExplorerBase =
  process.env.NEXT_PUBLIC_BSCSCAN_BASE ||
  (targetChainId === 56 ? "https://bscscan.com" : "https://testnet.bscscan.com");

const chainName = targetChainId === 56 ? "BSC" : "BSC Testnet";
const nativeSymbol = targetChainId === 56 ? "BNB" : "tBNB";

export const configuredChain = defineChain({
  id: targetChainId,
  name: chainName,
  nativeCurrency: { name: "BNB", symbol: nativeSymbol, decimals: 18 },
  rpcUrls: {
    default: { http: [targetRpcUrl] },
    public: { http: [targetRpcUrl] },
  },
  blockExplorers: {
    default: { name: "BscScan", url: targetExplorerBase },
  },
});
