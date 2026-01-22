"use client";

import React, { useEffect, useMemo, useState } from "react";
import { WagmiProvider, http } from "wagmi";
import { type Transport } from "viem";
import { bsc, bscTestnet } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { getPublicConfig } from "@/lib/publicConfig";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  const queryClient = useMemo(() => new QueryClient(), []);

  const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
  const config = useMemo(() => {
    if (!mounted) return null;
    const publicConfig = getPublicConfig();
    const transports = {
      [bsc.id]: http(
        publicConfig.chainId === bsc.id && publicConfig.rpcUrl
          ? publicConfig.rpcUrl
          : undefined
      ),
      [bscTestnet.id]: http(
        publicConfig.chainId === bscTestnet.id && publicConfig.rpcUrl
          ? publicConfig.rpcUrl
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
  }, [mounted, projectId]);

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
