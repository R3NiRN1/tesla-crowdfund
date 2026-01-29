"use client";

import { useSwitchChain } from "wagmi";

import { useNetworkGuard } from "@/lib/useNetworkGuard";

export default function NetworkGuard() {
  const guard = useNetworkGuard();
  const { switchChain, isPending } = useSwitchChain();

  if (!guard.isWrongNetwork) return null;

  return (
    <div
      style={{
        marginBottom: 16,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #dc2626",
        background: "#fef2f2",
        color: "#991b1b",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600 }}>Wrong network detected</div>
      <div>{guard.message}</div>
      <div>Switch network in your wallet to {guard.expectedLabel ?? guard.expectedChainId}.</div>
      {guard.expectedChainId !== null && (
        <button
          onClick={() => switchChain({ chainId: guard.expectedChainId! })}
          disabled={isPending}
          style={{
            marginTop: 8,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #fecaca",
            background: "white",
            color: "#991b1b",
            cursor: "pointer",
          }}
        >
          {isPending ? "Switching…" : `Switch to ${guard.expectedLabel}`}
        </button>
      )}
    </div>
  );
}
