"use client";

import React, { useEffect, useMemo, useState } from "react";
import { WagmiProvider, http } from "wagmi";
import { type Transport } from "viem";
import { bsc, bscTestnet } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  const queryClient = useMemo(() => new QueryClient(), []);

  const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
  const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || bscTestnet.id);

  const config = useMemo(() => {
    if (!mounted) return null;
    if (!projectId) return null;

    const transports = {
      [bsc.id]: http(
        chainId === bsc.id && rpcUrl
          ? rpcUrl
          : undefined
      ),
      [bscTestnet.id]: http(
        chainId === bscTestnet.id && rpcUrl
          ? rpcUrl
          : undefined
      ),
    } satisfies Record<56 | 97, Transport>;

    return getDefaultConfig({
      appName: "TES Crowdfund",
      projectId,
      chains: [bsc, bscTestnet],
      transports,
      ssr: false,
    });
  }, [mounted, projectId, rpcUrl, chainId]);

  useEffect(() => setMounted(true), []);

  if (!mounted || !config) {
    return <div style={{ padding: 16, fontFamily: "system-ui", opacity: 0.8 }}>Loading web3…</div>;
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
