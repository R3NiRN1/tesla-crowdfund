"use client";

import { useSwitchChain } from "wagmi";

import { useNetworkGuard } from "@/lib/useNetworkGuard";

export default function NetworkGuard() {
  const guard = useNetworkGuard();
  const { switchChain, isPending } = useSwitchChain();

  if (!guard.isWrongNetwork) return null;

  return (
    <div className="panel-danger">
      <div style={{ fontWeight: 700 }}>wrong network</div>
      <div>{guard.message}</div>
      <div>Switch network in your wallet to {guard.expectedLabel ?? guard.expectedChainId}.</div>
      {guard.expectedChainId !== null && (
        <button
          onClick={() => switchChain({ chainId: guard.expectedChainId! })}
          disabled={isPending}
          className="button-secondary"
          style={{ marginTop: 8 }}
        >
          {isPending ? "Switching..." : `Switch to ${guard.expectedLabel}`}
        </button>
      )}
    </div>
  );
}
