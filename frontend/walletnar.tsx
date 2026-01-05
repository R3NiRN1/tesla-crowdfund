"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { bscTestnet } from "wagmi/chains";

function short(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function WalletBar() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { connect, connectors, isPending } = useConnect();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  const wrongChain = isConnected && chainId !== bscTestnet.id;

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: 12,
        border: "1px solid #ddd",
        borderRadius: 12,
        marginBottom: 16,
      }}
    >
      {!isConnected ? (
        <>
          <b>Wallet:</b>
          {connectors.map((c) => (
            <button
              key={c.id}
              onClick={() => connect({ connector: c })}
              disabled={isPending}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ccc" }}
            >
              {isPending ? "Connecting…" : `Connect ${c.name}`}
            </button>
          ))}
        </>
      ) : (
        <>
          <b>Connected:</b> <span>{short(address!)}</span>

          {wrongChain ? (
            <button
              onClick={() => switchChain({ chainId: bscTestnet.id })}
              disabled={switching}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #cc9",
                background: "#fff7cc",
              }}
            >
              {switching ? "Switching…" : "Switch to BSC Testnet"}
            </button>
          ) : (
            <span style={{ opacity: 0.8 }}>(BSC Testnet)</span>
          )}

          <button
            onClick={() => disconnect()}
            style={{ marginLeft: "auto", padding: "8px 12px", borderRadius: 10, border: "1px solid #ccc" }}
          >
            Disconnect
          </button>
        </>
      )}
    </div>
  );
}
