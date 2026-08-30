"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

import { BackendClientError, getBackendUrl } from "@/lib/backendClient";
import { useBackendAuth } from "@/lib/useBackendAuth";
import { useNetworkGuard } from "@/lib/useNetworkGuard";

function short(address?: string) {
  if (!address) return "?";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WalletBar() {
  const { address, isConnected } = useAccount();
  const guard = useNetworkGuard();
  const backendUrl = getBackendUrl();
  const backendAuth = useBackendAuth();
  const [mounted, setMounted] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setAuthMessage(null), [address]);

  const authenticate = async () => {
    if (!address || !backendUrl) return;
    setAuthMessage(null);
    try {
      const session = await backendAuth.authenticate();
      setAuthMessage(`Backend session active until ${new Date(session.expiresAt).toLocaleTimeString()}`);
    } catch (error) {
      setAuthMessage(error instanceof BackendClientError || error instanceof Error ? error.message : "Wallet verification was not completed");
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
        <button
          type="button"
          className={backendAuth.isAuthenticated ? "button-disabled" : "button-secondary"}
          disabled={backendAuth.authenticating || backendAuth.isAuthenticated}
          onClick={() => void authenticate()}
        >
          {backendAuth.authenticating
            ? "Check wallet..."
            : backendAuth.isAuthenticated
            ? "Backend authenticated"
            : "Authenticate backend"}
        </button>
      )}
      {authMessage && <span className="small muted">{authMessage}</span>}
    </div>
  );
}
