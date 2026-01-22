import { useMemo } from "react";
import { useAccount, useChainId } from "wagmi";
import { targetChainId } from "./chain";

export function useNetworkGuard() {
  const { isConnected } = useAccount();
  const chainId = useChainId();

  const mismatch = isConnected && chainId !== targetChainId;

  const message = useMemo(() => {
    if (!mismatch) return null;
    return `Wrong network: expected chainId ${targetChainId}, got ${chainId}. Please switch network in your wallet to chainId ${targetChainId}.`;
  }, [mismatch, chainId]);

  return {
    expectedChainId: targetChainId,
    actualChainId: chainId,
    isMismatch: mismatch,
    message,
  };
}
