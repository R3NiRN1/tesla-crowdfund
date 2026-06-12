"use client";

import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

import {
  BackendClientError,
  getBackendUrl,
  requestBackendAuthNonce,
  verifyBackendAuthSignature,
} from "@/lib/backendClient";
import { useNetworkGuard } from "@/lib/useNetworkGuard";

function short(address?: string) {
  if (!address) return "?";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WalletBar() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const guard = useNetworkGuard();
  const backendUrl = getBackendUrl();
  const [mounted, setMounted] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setAuthMessage(null), [address]);

  const authenticate = async () => {
    if (!address || !backendUrl) return;
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      const challenge = await requestBackendAuthNonce(address);
      const signature = await signMessageAsync({ message: challenge.message });
      const result = await verifyBackendAuthSignature(address, challenge.nonce, signature);
      setAuthMessage(result.authenticated ? "Backend signature verified" : "Verification failed");
    } catch (error) {
      setAuthMessage(error instanceof BackendClientError ? error.message : "Wallet verification was not completed");
    } finally {
      setAuthBusy(false);
    }
  };

  if (!mounted) return null;
  if (!isConnected) return <span style={{ opacity: 0.7 }}>Not connected</span>;

  return (
    <div className="button-row">
      <span style={{ opacity: 0.8 }}>
        Connected: {short(address)} ({guard.actualLabel ?? `chain ${guard.actualChainId ?? "?"}`})
        {guard.isWrongNetwork && guard.expectedLabel ? ` | expected ${guard.expectedLabel}` : ""}
      </span>
      {backendUrl && (
        <button type="button" className="button-secondary" disabled={authBusy} onClick={() => void authenticate()}>
          {authBusy ? "Check wallet..." : "Verify wallet with backend"}
        </button>
      )}
      {authMessage && <span className="small muted">{authMessage}</span>}
    </div>
  );
}
