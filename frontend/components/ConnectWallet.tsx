"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

export default function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const connector = connectors.find((candidate) => candidate.id === "injected") ?? connectors[0];

  if (isConnected && address) {
    return (
      <button type="button" className="button-link" onClick={() => disconnect()}>
        {address.slice(0, 6)}...{address.slice(-4)} · Disconnect
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        className={connector ? "button-primary" : "button-disabled"}
        disabled={!connector || isPending}
        onClick={() => connector && connect({ connector })}
      >
        {isPending ? "Connecting..." : connector ? "Connect browser wallet" : "No browser wallet detected"}
      </button>
      {error && <div className="small panel-danger" style={{ marginTop: 6 }}>{error.message}</div>}
    </div>
  );
}
