"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";

import { readFactoryIndex } from "@/lib/readFactory";
import { readCampaign, CampaignView } from "@/lib/readCampaign";

import FundCampaign from "@/components/FundCampaign";
import WalletBar from "@/components/WalletBar";
import ConnectWallet from "@/components/ConnectWallet";
import NetworkGuard from "@/components/NetworkGuard";

import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { campaignWriteAbi } from "@/lib/campaignWriteAbi";
import { getPublicConfig, ZERO_ADDRESS } from "@/lib/publicConfig";
import { useNetworkGuard } from "@/lib/useNetworkGuard";

function short(addr?: string) {
  if (!addr) return "—";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function Home() {
  const publicConfig = getPublicConfig();
  const explorer = publicConfig.bscscanBase || "https://testnet.bscscan.com";
  const setupMode = !publicConfig.isConfigured;
  const networkGuard = useNetworkGuard();
  const { address: connected, isConnected } = useAccount();
  const { writeContract, data: claimHash, isPending: claimPending, error: claimError } = useWriteContract();
  const claimReceipt = useWaitForTransactionReceipt({ hash: claimHash });

  const [token, setToken] = useState<`0x${string}` | null>(null);
  const [addresses, setAddresses] = useState<`0x${string}`[]>([]);
  const [selected, setSelected] = useState<`0x${string}` | null>(null);

  const [campaign, setCampaign] = useState<CampaignView | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Load factory + campaigns
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const idx = await readFactoryIndex();
        const factoryToken = idx.token as `0x${string}`;

        setToken(factoryToken);
        setAddresses(idx.addresses);
        setSelected(idx.addresses[0] ?? null);

        setLoading(false);
      } catch (e: any) {
        setErr(e?.message || String(e));
        setLoading(false);
      }
    })();
  }, []);

  async function refreshSelectedCampaign(addr?: `0x${string}` | null) {
    const useAddr = addr ?? selected;
    if (!useAddr) return;
    try {
      const c = await readCampaign(useAddr);
      setCampaign(c);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  // Load selected campaign
  useEffect(() => {
    if (!selected) return;
    setCampaign(null);
    refreshSelectedCampaign(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const stats = useMemo(() => {
    if (!campaign) return null;
    const goal = Number(formatUnits(campaign.goal, 18));
    const raised = Number(formatUnits(campaign.totalContributed, 18));
    const pct = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
    return { goal, raised, pct };
  }, [campaign]);

  // Prefer factory token; fall back to env token if needed
  const tokenAddress =
    token && token.toLowerCase() !== ZERO_ADDRESS
      ? token
      : publicConfig.tokenAddress !== ZERO_ADDRESS
      ? (publicConfig.tokenAddress as `0x${string}`)
      : null;

  const isOwner = useMemo(() => {
    if (!campaign || !connected) return false;
    return campaign.owner.toLowerCase() === connected.toLowerCase();
  }, [campaign, connected]);

  const goalReached = useMemo(() => {
    if (!campaign) return false;
    return campaign.totalContributed >= campaign.goal;
  }, [campaign]);

  // After claim confirms, refresh campaign state so milestones update
  useEffect(() => {
    if (claimReceipt.data?.status === "success" && campaign?.address) {
      refreshSelectedCampaign(campaign.address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimReceipt.data?.status]);

  const claimMilestone = (index: number) => {
    if (setupMode || networkGuard.blockWrites) return;
    if (!campaign) return;
    writeContract({
      address: campaign.address,
      abi: campaignWriteAbi,
      functionName: "claimMilestone",
      args: [BigInt(index)],
    });
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>TES Crowdfund – Testnet Explorer</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <WalletBar />
          <ConnectWallet />
        </div>
      </header>

      <NetworkGuard />

      {setupMode && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #f59e0b",
            background: "#fffbeb",
            color: "#92400e",
            fontSize: 14,
          }}
        >
          Setup required: contract addresses not configured. Update NEXT_PUBLIC_FACTORY_ADDRESS and
          NEXT_PUBLIC_TOKEN_ADDRESS to enable write actions.
        </div>
      )}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 18, fontSize: 14 }}>
        <span>
          Factory:{" "}
          <a href={`${explorer}/address/${publicConfig.factoryAddress}`} target="_blank" rel="noreferrer">
            {short(publicConfig.factoryAddress)}
          </a>
        </span>

        {tokenAddress && (
          <span>
            Token:{" "}
            <a href={`${explorer}/address/${tokenAddress}`} target="_blank" rel="noreferrer">
              {short(tokenAddress)}
            </a>
          </span>
        )}

        <span>Campaigns: {addresses.length}</span>
      </div>

      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}
      {loading && <p>Loading factory…</p>}

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, alignItems: "start" }}>
        {/* LEFT: campaign list */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <b>Campaigns</b>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {addresses.map((a, i) => (
              <button
                key={a}
                onClick={() => setSelected(a)}
                style={{
                  textAlign: "left",
                  padding: 10,
                  borderRadius: 10,
                  border: a === selected ? "2px solid #111" : "1px solid #ddd",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700 }}>#{i + 1}</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>{short(a)}</div>
              </button>
            ))}
            {addresses.length === 0 && <div style={{ opacity: 0.7 }}>No campaigns yet.</div>}
          </div>
        </div>

        {/* RIGHT: selected campaign */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          {!selected ? (
            <p>Select a campaign.</p>
          ) : !campaign ? (
            <p>Loading campaign…</p>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ margin: 0 }}>Campaign</h2>
                <a href={`${explorer}/address/${campaign.address}`} target="_blank" rel="noreferrer">
                  {short(campaign.address)}
                </a>
              </div>

              <p style={{ marginTop: 10 }}>{campaign.description}</p>

              <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
                <div>
                  <b>Owner:</b>{" "}
                  <a href={`${explorer}/address/${campaign.owner}`} target="_blank" rel="noreferrer">
                    {short(campaign.owner)}
                  </a>
                </div>
                <div>
                  <b>Deadline:</b> {new Date(Number(campaign.deadline) * 1000).toLocaleString()}
                </div>
              </div>

              {stats && (
                <>
                  <h3 style={{ marginTop: 18 }}>Funding</h3>
                  <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
                    <div style={{ marginBottom: 8 }}>
                      <b>Raised:</b> {stats.raised.toLocaleString()} / {stats.goal.toLocaleString()} TES
                    </div>
                    <div style={{ height: 10, background: "#eee", borderRadius: 999 }}>
                      <div style={{ width: `${stats.pct}%`, height: 10, background: "#111", borderRadius: 999 }} />
                    </div>
                  </div>
                </>
              )}

              {/* Funding actions (Approve + Contribute) */}
              {tokenAddress ? (
                <FundCampaign
                  token={tokenAddress}
                  campaign={campaign.address}
                  onContributed={() => refreshSelectedCampaign(campaign.address)}
                  disabled={setupMode || networkGuard.blockWrites}
                  disabledReason={
                    setupMode
                      ? "Setup required: contract addresses not configured."
                      : networkGuard.message || "Wrong network: switch to the expected chain."
                  }
                />
              ) : (
                <div style={{ marginTop: 12, color: "crimson" }}>
                  Missing token address (factory token not loaded and NEXT_PUBLIC_TOKEN_ADDRESS not set).
                </div>
              )}

              <h3 style={{ marginTop: 18 }}>Milestones</h3>

              {/* Claim status/help */}
              <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>
                <div>
                  Claiming is available only to the campaign owner and only after the goal is reached.
                </div>
                {!isConnected && <div>Connect wallet to claim.</div>}
                {isConnected && !isOwner && <div>Connected wallet is not the owner.</div>}
                {isConnected && isOwner && !goalReached && <div>Goal not reached yet.</div>}
                {claimError && <div style={{ color: "crimson" }}>{String((claimError as any)?.message || claimError)}</div>}
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {campaign.milestones.map((m, i) => {
                  const canClaim =
                    !setupMode &&
                    !networkGuard.blockWrites &&
                    isConnected &&
                    isOwner &&
                    goalReached &&
                    !m.claimed &&
                    !claimPending &&
                    !claimReceipt.isLoading;

                  return (
                    <div key={i} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                        <b>#{i + 1}</b>
                        <span>{m.claimed ? "✅ claimed" : "⏳ not claimed"}</span>
                      </div>

                      <div style={{ marginTop: 6 }}>{m.description}</div>

                      <div style={{ marginTop: 6 }}>
                        <b>Amount:</b> {Number(formatUnits(m.amount, 18)).toLocaleString()} TES
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          onClick={() => claimMilestone(i)}
                          disabled={!canClaim}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "1px solid #111",
                            background: "white",
                            cursor: "pointer",
                            opacity: canClaim ? 1 : 0.5,
                          }}
                          title={
                            m.claimed
                              ? "Already claimed"
                              : setupMode
                              ? "Setup required"
                              : !isConnected
                              ? "Connect wallet"
                              : !isOwner
                              ? "Only owner can claim"
                              : !goalReached
                              ? "Goal not reached"
                              : "Claim this milestone"
                          }
                        >
                          {claimReceipt.isLoading ? "Claiming…" : "Claim"}
                        </button>

                        {claimHash && (
                          <span style={{ fontSize: 12, opacity: 0.8 }}>
                            Tx:{" "}
                            <a href={`${explorer}/tx/${claimHash}`} target="_blank" rel="noreferrer">
                              {short(claimHash)}
                            </a>{" "}
                            {claimReceipt.data?.status === "success" ? "✅" : claimReceipt.isLoading ? "⏳" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
