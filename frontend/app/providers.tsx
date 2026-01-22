"use client";

import React, { useEffect, useMemo, useState } from "react";
import { WagmiProvider, http, createConfig } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { getPublicConfig } from "@/lib/publicConfig";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  const queryClient = useMemo(() => new QueryClient(), []);

  const config = useMemo(() => {
    if (!mounted) return null;
    const publicConfig = getPublicConfig();
    const transports = {
      [bscTestnet.id]: publicConfig.rpcUrl ? http(publicConfig.rpcUrl) : http(),
    };

    if (publicConfig.wcEnabled && publicConfig.wcProjectId) {
      return getDefaultConfig({
        appName: "TES Crowdfund",
        projectId: publicConfig.wcProjectId,
        chains: [bscTestnet],
        transports,
        ssr: false,
      });
    }

    return createConfig({
      chains: [bscTestnet],
      connectors: [injected()],
      transports,
      ssr: false,
    });
  }, [mounted]);

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
