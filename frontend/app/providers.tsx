"use client";

import React, { useEffect, useMemo, useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { type Transport } from "viem";
import { bsc, bscTestnet } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePublicConfig } from "@/lib/usePublicConfig";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const publicConfig = usePublicConfig();

  const queryClient = useMemo(() => new QueryClient(), []);

  const config = useMemo(() => {
    if (!mounted) return null;
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

    return createConfig({
      chains: [bsc, bscTestnet],
      connectors: [injected()],
      transports,
      ssr: false,
    });
  }, [mounted, publicConfig]);

  useEffect(() => setMounted(true), []);

  if (!mounted || !config) {
    return <div style={{ padding: 16, fontFamily: "system-ui", opacity: 0.8 }}>Loading web3…</div>;
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
