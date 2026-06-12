"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import AlphaNavigation from "@/components/AlphaNavigation";
import ConnectWallet from "@/components/ConnectWallet";
import FundCampaign from "@/components/FundCampaign";
import NetworkGuard from "@/components/NetworkGuard";
import PublishedCampaigns from "@/components/PublishedCampaigns";
import SetupBanner from "@/components/SetupBanner";
import WalletBar from "@/components/WalletBar";
import { campaignWriteAbi } from "@/lib/campaignWriteAbi";
import { demoCampaigns, getMilestoneTotal, type DemoCampaign } from "@/lib/demoCampaigns";
import { ZERO_ADDRESS } from "@/lib/publicConfig";
import { readCampaign, type CampaignView, type MilestoneView } from "@/lib/readCampaign";
import { readFactoryIndex } from "@/lib/readFactory";
import { useNetworkGuard } from "@/lib/useNetworkGuard";
import { usePublicConfig } from "@/lib/usePublicConfig";

type SelectedCampaign =
  | {
      kind: "demo";
      data: DemoCampaign;
    }
  | {
      kind: "chain";
      data: CampaignView;
    };

function short(addr?: string | null) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTes(value: bigint) {
  const asNumber = Number(formatUnits(value, 18));
  if (!Number.isFinite(asNumber)) return `${formatUnits(value, 18)} TES`;
  return `${asNumber.toLocaleString(undefined, { maximumFractionDigits: 2 })} TES`;
}

function progressPercent(campaign: CampaignView) {
  if (campaign.goal <= 0n) return 0;
  return Math.min(100, Number((campaign.totalContributed * 10000n) / campaign.goal) / 100);
}

function formatDeadline(deadline: bigint) {
  return new Date(Number(deadline) * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AddressValue({
  address,
  explorer,
  linked,
}: {
  address: `0x${string}`;
  explorer: string;
  linked: boolean;
}) {
  if (!linked) return <span>{short(address)}</span>;
  return (
    <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">
      {short(address)}
    </a>
  );
}

function DisabledAction({ title, reason, label }: { title: string; reason: string; label: string }) {
  return (
    <div className="disabled-action">
      <div>
        <strong>{title}</strong>
        <div className="small" style={{ marginTop: 4 }}>
          {reason}
        </div>
      </div>
      <button type="button" className="button-disabled" disabled>
        {label}
      </button>
    </div>
  );
}

export default function Home() {
  const publicConfig = usePublicConfig();
  const networkGuard = useNetworkGuard();
  const explorer = publicConfig.bscscanBase || "https://testnet.bscscan.com";
  const setupMode = !publicConfig.isConfigured;
  const noConfiguredFactory = publicConfig.factoryAddress.toLowerCase() === ZERO_ADDRESS;

  const { address: connected } = useAccount();
  const { writeContract, data: claimHash, isPending: claimPending, error: claimError } = useWriteContract();
  const claimReceipt = useWaitForTransactionReceipt({ hash: claimHash });

  const [token, setToken] = useState<`0x${string}` | null>(null);
  const [addresses, setAddresses] = useState<`0x${string}`[]>([]);
  const [selected, setSelected] = useState<`0x${string}` | null>(null);
  const [selectedDemoId, setSelectedDemoId] = useState(demoCampaigns[0]?.id ?? "");
  const [campaign, setCampaign] = useState<CampaignView | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFactory() {
      setErr(null);
      setCampaign(null);

      if (!publicConfig.isConfigured) {
        setLoading(false);
        setToken(null);
        setAddresses([]);
        setSelected(null);
        return;
      }

      try {
        setLoading(true);
        const idx = await readFactoryIndex();
        if (cancelled) return;
        const nextAddresses = idx.addresses;
        setToken(idx.token as `0x${string}`);
        setAddresses(nextAddresses);
        setSelected(nextAddresses[0] ?? null);
      } catch (error: unknown) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setErr(message);
        setAddresses([]);
        setSelected(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFactory();

    return () => {
      cancelled = true;
    };
  }, [
    publicConfig.chainId,
    publicConfig.factoryAddress,
    publicConfig.isConfigured,
    publicConfig.rpcUrl,
    publicConfig.tokenAddress,
  ]);

  const refreshSelectedCampaign = useCallback(
    async (addr?: `0x${string}` | null) => {
      const useAddr = addr ?? selected;
      if (!useAddr || !publicConfig.isConfigured) return;
      try {
        const nextCampaign = await readCampaign(useAddr);
        setCampaign(nextCampaign);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setErr(message);
      }
    },
    [publicConfig.isConfigured, selected]
  );

  useEffect(() => {
    if (!selected || !publicConfig.isConfigured) {
      setCampaign(null);
      return;
    }
    setCampaign(null);
    refreshSelectedCampaign(selected);
  }, [publicConfig.isConfigured, refreshSelectedCampaign, selected]);

  useEffect(() => {
    if (claimReceipt.data?.status === "success" && campaign?.address) {
      refreshSelectedCampaign(campaign.address);
    }
  }, [campaign?.address, claimReceipt.data?.status, refreshSelectedCampaign]);

  const showDemoCampaigns = !loading && noConfiguredFactory && addresses.length === 0;
  const selectedDemo = showDemoCampaigns
    ? demoCampaigns.find((item) => item.id === selectedDemoId) ?? demoCampaigns[0]
    : null;

  const selectedView: SelectedCampaign | null = selectedDemo
    ? { kind: "demo", data: selectedDemo }
    : campaign
    ? { kind: "chain", data: campaign }
    : null;

  const tokenAddress =
    token && token.toLowerCase() !== ZERO_ADDRESS
      ? token
      : publicConfig.tokenAddress !== ZERO_ADDRESS
      ? (publicConfig.tokenAddress as `0x${string}`)
      : null;

  const isOwner =
    !!selectedView &&
    selectedView.kind === "chain" &&
    !!connected &&
    selectedView.data.owner.toLowerCase() === connected.toLowerCase();

  const goalReached = selectedView ? selectedView.data.totalContributed >= selectedView.data.goal : false;

  const currentMode = networkGuard.isWrongNetwork
    ? "wrong network"
    : showDemoCampaigns
    ? "demo/local"
    : setupMode
    ? "setup/read-only"
    : publicConfig.chainId === 97
    ? "configured testnet"
    : "configured network";

  const modeItems = [
    {
      label: "setup/read-only",
      active: setupMode,
      detail: setupMode
        ? "Contract writes stay disabled until RPC, factory, and token settings are saved."
        : "Setup is complete for reads and guarded writes.",
      danger: false,
    },
    {
      label: "demo/local",
      active: showDemoCampaigns,
      detail: showDemoCampaigns
        ? "Showing local sample campaigns because no factory is configured."
        : "Hidden once a factory is configured.",
      danger: false,
    },
    {
      label: "configured testnet",
      active: publicConfig.isConfigured && publicConfig.chainId === 97 && !networkGuard.isWrongNetwork,
      detail: "Reads and funding use the configured BSC testnet contracts.",
      danger: false,
    },
    {
      label: "wrong network",
      active: networkGuard.isWrongNetwork,
      detail: networkGuard.message || "Wallet network does not match the configured chain.",
      danger: true,
    },
  ];

  const writeDisabledReason =
    selectedView?.kind === "demo"
      ? "Demo/local mode uses sample campaigns that are demo only — not on-chain."
      : setupMode
      ? "Setup required: configure RPC, factory, and token addresses before sending transactions."
      : networkGuard.blockWrites
      ? networkGuard.message || "Wrong network: switch to the configured chain before sending transactions."
      : null;

  const claimMilestone = (index: number) => {
    if (writeDisabledReason || !selectedView || selectedView.kind !== "chain" || !isOwner || !goalReached) return;
    writeContract({
      address: selectedView.data.address,
      abi: campaignWriteAbi,
      functionName: "claimMilestone",
      args: [BigInt(index)],
    });
  };

  const getClaimReason = (milestone: MilestoneView) => {
    if (milestone.claimed) return "Already claimed.";
    if (writeDisabledReason) return writeDisabledReason;
    if (!isOwner) return "Owner-only action: connect as the campaign owner to claim.";
    if (!goalReached) return "Goal not reached yet.";
    if (claimPending) return "Claim transaction is pending.";
    return null;
  };

  return (
    <main className="alpha-shell">
      <div className="alpha-container">
        <header className="alpha-header">
          <div>
            <p className="eyebrow">Alpha UX dashboard</p>
            <h1>TES Crowdfund</h1>
            <p>
              Shareable demo and testnet workspace for campaigns, local drafts, and guarded contract actions.
              Current mode: <strong>{currentMode}</strong>.
            </p>
          </div>
          <div className="alpha-actions">
            <WalletBar />
            <ConnectWallet />
          </div>
        </header>

        <AlphaNavigation active="deployed" />

        <NetworkGuard />
        <SetupBanner />

        <section className="mode-grid" aria-label="Current alpha mode">
          {modeItems.map((item) => (
            <div key={item.label} className={`mode-card${item.active ? " active" : ""}${item.danger ? " danger" : ""}`}>
              <div className="mode-label">{item.label}</div>
              <p className="small">{item.detail}</p>
            </div>
          ))}
        </section>

        <section className="quick-grid" aria-label="Alpha workspace shortcuts">
          <div className="panel">
            <h2>Setup</h2>
            <p className="section-subtitle">Save local chain settings for BSC testnet contract reads and writes.</p>
            <div style={{ marginTop: 12 }}>
              <Link className="button-link" href="/setup">
                Open setup
              </Link>
            </div>
          </div>
          <div className="panel">
            <h2>Campaign drafts</h2>
            <p className="section-subtitle">Browser-only campaign payloads for alpha planning.</p>
            <div className="button-row" style={{ marginTop: 12 }}>
              <Link className="button-link" href="/campaigns">
                View drafts
              </Link>
              <Link className="button-primary" href="/campaigns/new">
                New draft
              </Link>
            </div>
          </div>
          <div className="panel">
            <h2>Admin scaffold</h2>
            <p className="section-subtitle">Local-only admin surface for config, drafts, and audit notes.</p>
            <div style={{ marginTop: 12 }}>
              <Link className="button-link" href="/admin">
                Open admin
              </Link>
            </div>
          </div>
        </section>

        <PublishedCampaigns />

        <section id="deployed-campaigns" className="panel">
          <div className="campaign-title-row">
            <div>
              <p className="eyebrow">Deployed campaigns</p>
              <h2>Campaign explorer</h2>
              <p className="section-subtitle">
                {showDemoCampaigns
                  ? "No factory is configured, so these local samples are shown for alpha demos."
                  : "Reads existing campaigns from the configured factory and keeps writes guarded by setup and network state."}
              </p>
            </div>
            {showDemoCampaigns && <span className="badge badge-demo">demo only — not on-chain</span>}
          </div>

          <div className="stats-grid" style={{ marginTop: 16 }}>
            <div className="stat-card">
              <span className="stat-label">Factory</span>
              <span className="stat-value">
                {noConfiguredFactory ? (
                  "not configured"
                ) : (
                  <AddressValue address={publicConfig.factoryAddress as `0x${string}`} explorer={explorer} linked />
                )}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Token</span>
              <span className="stat-value">
                {tokenAddress ? <AddressValue address={tokenAddress} explorer={explorer} linked /> : "not configured"}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Campaigns</span>
              <span className="stat-value">{showDemoCampaigns ? `${demoCampaigns.length} demo` : addresses.length}</span>
            </div>
          </div>

          {err && (
            <div className="panel-danger" style={{ marginTop: 14 }}>
              Error reading configured contracts: {err}
            </div>
          )}
          {loading && (
            <div className="empty-state" style={{ marginTop: 14 }}>
              Loading factory campaigns...
            </div>
          )}

          {!loading && !showDemoCampaigns && addresses.length === 0 && (
            <div className="empty-state" style={{ marginTop: 14 }}>
              <strong>No deployed campaigns found.</strong>
              <p>
                {publicConfig.isConfigured
                  ? "The configured factory returned zero campaigns. Local drafts remain available as scaffold data."
                  : "Complete setup to read a factory, or use the local draft tools while the app is in setup/read-only mode."}
              </p>
              <div className="button-row" style={{ marginTop: 12 }}>
                <Link className="button-link" href="/setup">
                  Setup
                </Link>
                <Link className="button-link" href="/campaigns/new">
                  New draft
                </Link>
              </div>
            </div>
          )}

          {(showDemoCampaigns || addresses.length > 0) && (
            <div className="campaign-layout" style={{ marginTop: 16 }}>
              <div className="campaign-list" aria-label="Campaign list">
                {showDemoCampaigns
                  ? demoCampaigns.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`campaign-list-button${item.id === selectedDemo?.id ? " active" : ""}`}
                        onClick={() => setSelectedDemoId(item.id)}
                      >
                        <span className="badge badge-demo">demo only — not on-chain</span>
                        <div style={{ marginTop: 8, fontWeight: 800 }}>{item.title}</div>
                        <div className="small muted">{item.category}</div>
                      </button>
                    ))
                  : addresses.map((address, index) => (
                      <button
                        key={address}
                        type="button"
                        className={`campaign-list-button${address === selected ? " active" : ""}`}
                        onClick={() => setSelected(address)}
                      >
                        <span className="badge badge-muted">testnet #{index + 1}</span>
                        <div style={{ marginTop: 8, fontWeight: 800 }}>{short(address)}</div>
                        <div className="small muted">On-chain campaign</div>
                      </button>
                    ))}
              </div>

              <div className="panel">
                {!selectedView && <div className="empty-state">Select a campaign to view details.</div>}

                {selectedView && (
                  <>
                    <div className="campaign-title-row">
                      <div>
                        {selectedView.kind === "demo" && (
                          <span className="badge badge-demo">demo only — not on-chain</span>
                        )}
                        <h2 style={{ marginTop: selectedView.kind === "demo" ? 10 : 0 }}>
                          {selectedView.kind === "demo"
                            ? selectedView.data.title
                            : `Campaign ${short(selectedView.data.address)}`}
                        </h2>
                        <p className="section-subtitle">{selectedView.data.description}</p>
                      </div>
                      <AddressValue
                        address={selectedView.data.address}
                        explorer={explorer}
                        linked={selectedView.kind === "chain"}
                      />
                    </div>

                    <div className="detail-grid">
                      <div className="detail-item">
                        <strong>Raised</strong>
                        {formatTes(selectedView.data.totalContributed)}
                      </div>
                      <div className="detail-item">
                        <strong>Goal</strong>
                        {formatTes(selectedView.data.goal)}
                      </div>
                      <div className="detail-item">
                        <strong>Deadline</strong>
                        {formatDeadline(selectedView.data.deadline)}
                      </div>
                      <div className="detail-item">
                        <strong>Owner</strong>
                        <AddressValue
                          address={selectedView.data.owner}
                          explorer={explorer}
                          linked={selectedView.kind === "chain"}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div className="split-row">
                        <strong>{progressPercent(selectedView.data).toFixed(1)}% funded</strong>
                        <span className="small muted">
                          Milestones total: {formatTes(getMilestoneTotal(selectedView.data.milestones))}
                        </span>
                      </div>
                      <div className="progress-track" aria-hidden="true">
                        <div className="progress-bar" style={{ width: `${progressPercent(selectedView.data)}%` }} />
                      </div>
                    </div>

                    {selectedView.kind === "demo" ? (
                      <DisabledAction
                        title="Funding disabled"
                        reason={writeDisabledReason || "Demo campaign data is local-only."}
                        label="Fund"
                      />
                    ) : tokenAddress ? (
                      <FundCampaign
                        token={tokenAddress}
                        campaignAddress={selectedView.data.address}
                        onContributed={() => refreshSelectedCampaign(selectedView.data.address)}
                        disabled={!!writeDisabledReason}
                        disabledReason={writeDisabledReason ?? undefined}
                      />
                    ) : (
                      <DisabledAction
                        title="Funding disabled"
                        reason="Token address is not configured."
                        label="Fund"
                      />
                    )}

                    <div style={{ marginTop: 18 }}>
                      <div className="split-row">
                        <h3 style={{ margin: 0 }}>Milestones</h3>
                        {selectedView.kind === "demo" && <span className="small muted">{selectedView.data.statusNote}</span>}
                      </div>
                      <div className="milestone-list" style={{ marginTop: 10 }}>
                        {selectedView.data.milestones.map((milestone, index) => {
                          const reason = getClaimReason(milestone);
                          return (
                            <div className="milestone-item" key={`${milestone.description}-${index}`}>
                              <div className="split-row">
                                <div>
                                  <strong>{milestone.description}</strong>
                                  <div className="small muted">{formatTes(milestone.amount)}</div>
                                </div>
                                <span className={`badge ${milestone.claimed ? "badge-success" : "badge-muted"}`}>
                                  {milestone.claimed ? "claimed" : "open"}
                                </span>
                              </div>
                              <div className="button-row" style={{ marginTop: 10 }}>
                                <button
                                  type="button"
                                  className={reason ? "button-disabled" : "button-primary"}
                                  onClick={() => claimMilestone(index)}
                                  disabled={!!reason}
                                >
                                  {milestone.claimed ? "Claimed" : "Claim milestone"}
                                </button>
                                {reason && <span className="small muted">{reason}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {claimError && (
                        <div className="panel-danger" style={{ marginTop: 10 }}>
                          Claim error: {claimError.message}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
