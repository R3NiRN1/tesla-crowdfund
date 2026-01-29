"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";

import { readFactoryIndex } from "@/lib/readFactory";
import { readCampaign, CampaignView } from "@/lib/readCampaign";

import FundCampaign from "@/components/FundCampaign";
import WalletBar from "@/components/WalletBar";
import ConnectWallet from "@/components/ConnectWallet";
import NetworkGuard from "@/components/NetworkGuard";
import SetupBanner from "@/components/SetupBanner";

import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { campaignWriteAbi } from "@/lib/campaignWriteAbi";
import { ZERO_ADDRESS } from "@/lib/publicConfig";
import { useNetworkGuard } from "@/lib/useNetworkGuard";
import { usePublicConfig } from "@/lib/usePublicConfig";

function short(addr?: string) {
  if (!addr) return "—";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export default function Home() {
  const publicConfig = usePublicConfig();
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
        <div>
          <h1 style={{ margin: 0 }}>TES Crowdfund – Testnet Explorer</h1>
          <div style={{ display: "flex", gap: 12, fontSize: 14, marginTop: 6 }}>
            <Link href="/setup">Setup</Link>
            <Link href="/campaigns">Campaign drafts</Link>
            <Link href="/admin">Admin</Link>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <WalletBar />
          <ConnectWallet />
        </div>
      </header>

      <NetworkGuard />
      <SetupBanner />

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
          </div>
        </div>

        {/* RIGHT: campaign detail */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          {!campaign && !loading && <p>No campaign selected.</p>}
          {campaign && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <h2 style={{ margin: 0 }}>Campaign {short(campaign.address)}</h2>
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

              <div style={{ marginTop: 16 }}>
                <FundCampaign
                  campaign={campaign}
                  tokenAddress={tokenAddress}
                  setupMode={setupMode}
                  networkGuard={networkGuard}
                  token={tokenAddress}
                  campaignAddress={campaign.address}
                  onContributed={() => refreshSelectedCampaign(campaign.address)}
                  disabled={setupMode || networkGuard.blockWrites}
                  disabledReason={
                    setupMode
                      ? "Setup required: contract addresses not configured."
                      : networkGuard.message || "Wrong network: switch to the expected chain."
                  }
                />
              </div>

              {isOwner && campaign.milestones.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h3 style={{ margin: 0 }}>Milestones</h3>
                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    {campaign.milestones.map((m, i) => {
                      const isClaimed = campaign.milestonePaid[i];
                      return (
                        <div
                          key={`${m.title}-${i}`}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            padding: 10,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{m.title}</div>
                            <div style={{ fontSize: 13, opacity: 0.7 }}>{formatUnits(m.amount, 18)} TES</div>
                          </div>
                          <button
                            onClick={() => claimMilestone(i)}
                            disabled={setupMode || networkGuard.blockWrites || !goalReached || isClaimed || claimPending}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid #d1d5db",
                              background: isClaimed ? "#f3f4f6" : "white",
                              cursor: setupMode || networkGuard.blockWrites || isClaimed ? "not-allowed" : "pointer",
                            }}
                          >
                            {isClaimed ? "Claimed" : goalReached ? "Claim milestone" : "Goal not reached"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {claimError && <div style={{ color: "crimson", marginTop: 8 }}>Error: {claimError.message}</div>}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
