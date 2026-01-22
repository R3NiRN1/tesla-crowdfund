"use client";

import React, { useEffect, useMemo, useState } from "react";
import { WagmiProvider, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { configuredChain, targetRpcUrl } from "@/lib/chain";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  const queryClient = useMemo(() => new QueryClient(), []);

  const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
  const config = useMemo(() => {
    if (!mounted) return null;
    if (!projectId) return null;

    return getDefaultConfig({
      appName: "TES Crowdfund",
      projectId,
      chains: [configuredChain],
      transports: {
        [configuredChain.id]: targetRpcUrl ? http(targetRpcUrl) : http(),
      },
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
