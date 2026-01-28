"use client";

import { useMemo } from "react";
import { useAccount, useChainId } from "wagmi";

import { usePublicConfig } from "./usePublicConfig";

const chainLabels: Record<number, string> = {
  56: "BSC Mainnet",
  97: "BSC Testnet",
};

function getChainLabel(chainId: number) {
  return chainLabels[chainId] ?? `Chain ${chainId}`;
}

export type NetworkGuardState = {
  expectedChainId: number | null;
  actualChainId: number | null;
  expectedLabel: string | null;
  actualLabel: string | null;
  isConnected: boolean;
  isWrongNetwork: boolean;
  isMisconfigured: boolean;
  blockWrites: boolean;
  message: string | null;
};

export function useNetworkGuard(): NetworkGuardState {
  const { isConnected } = useAccount();
  const connectedChainId = useChainId();
  const publicConfig = usePublicConfig();

  return useMemo(() => {
    const expectedChainId = publicConfig.chainId ?? null;
    const actualChainId = isConnected ? connectedChainId : null;

    const isMisconfigured = isConnected && expectedChainId === null;
    const isWrongNetwork =
      isConnected && expectedChainId !== null && actualChainId !== null && actualChainId !== expectedChainId;

    const expectedLabel = expectedChainId !== null ? getChainLabel(expectedChainId) : null;
    const actualLabel = actualChainId !== null ? getChainLabel(actualChainId) : null;

    let message: string | null = null;
    if (isMisconfigured) {
      message = "Missing chain configuration. Complete setup to enable write actions.";
    }
    if (isWrongNetwork) {
      message = `Wrong network: expected ${expectedLabel ?? expectedChainId} (${expectedChainId}), got ${
        actualLabel ?? actualChainId
      } (${actualChainId}). Please switch network in your wallet.`;
    }

    return {
      expectedChainId,
      actualChainId,
      expectedLabel,
      actualLabel,
      isConnected,
      isWrongNetwork,
      isMisconfigured,
      blockWrites: isWrongNetwork || isMisconfigured,
      message,
    };
  }, [connectedChainId, isConnected, publicConfig.chainId]);
}
