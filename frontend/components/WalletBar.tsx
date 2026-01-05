"use client";

import { useAccount, useChainId } from "wagmi";
import { useEffect, useState } from "react";

function short(a?: string) {
  if (!a) return "?";
  return a.slice(0, 6) + "…" + a.slice(-4);
}

export default function WalletBar() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  // hydration guard
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  if (!isConnected) {
    return <span style={{ opacity: 0.7 }}>Not connected</span>;
  }

  return (
    <span style={{ opacity: 0.8 }}>
      Connected: {short(address)} (chain {chainId})
    </span>
  );
}
