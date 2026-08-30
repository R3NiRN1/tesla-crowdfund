"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatUnits } from "viem";

import AlphaNavigation from "@/components/AlphaNavigation";
import CampaignV2Actions from "@/components/CampaignV2Actions";
import ConnectWallet from "@/components/ConnectWallet";
import FundCampaign from "@/components/FundCampaign";
import NetworkGuard from "@/components/NetworkGuard";
import PublishedCampaigns from "@/components/PublishedCampaigns";
import SetupBanner from "@/components/SetupBanner";
import WalletBar from "@/components/WalletBar";
import { demoCampaigns, getMilestoneTotal, type DemoCampaign } from "@/lib/demoCampaigns";
import { erc20Abi } from "@/lib/erc20Abi";
import { ZERO_ADDRESS } from "@/lib/publicConfig";
import {
  CAMPAIGN_STATE_LABELS,
  MILESTONE_STATUS_LABELS,
  readCampaign,
  type CampaignView,
} from "@/lib/readCampaign";
import { EXPECTED_FACTORY_VERSION, readFactoryIndex } from "@/lib/readFactory";
import { getPublicClient } from "@/lib/publicClient";
import { useNetworkGuard } from "@/lib/useNetworkGuard";
import { usePublicConfig } from "@/lib/usePublicConfig";

type SelectedCampaign =
  | { kind: "demo"; data: DemoCampaign }
  | { kind: "chain"; data: CampaignView };

function short(value?: string | null) {
  if (!value) return "-";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatTime(value: bigint) {
  if (value === 0n) return "not set";
  const milliseconds = Number(value * 1000n);
  return Number.isSafeInteger(milliseconds) ? new Date(milliseconds).toLocaleString() : value.toString();
}

function progressPercent(campaign: CampaignView) {
  if (campaign.goal <= 0n) return 0;
  return Math.min(100, Number((campaign.totalContributed * 10000n) / campaign.goal) / 100);
}

function AddressValue({ address, explorer, linked }: { address: `0x${string}`; explorer: string; linked: boolean }) {
  if (!linked) return <span>{short(address)}</span>;
  return <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">{short(address)}</a>;
}

function DisabledAction({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="panel-warning" style={{ marginTop: 12 }}>
      <strong>{title}</strong>
      <div className="small" style={{ marginTop: 4 }}>{reason}</div>
    </div>
  );
}

function lifecycleCopy(campaign: CampaignView) {
  if (campaign.state === 0) return "Funding is open only until the immutable deadline and only until the exact hard cap is reached.";
  if (campaign.state === 1) return "Funding is complete. Escrow now moves only through sequential V2 evidence/review/dispute gates.";
  if (campaign.state === 2) return "Campaign is in its terminal refund state. Unreleased escrow is claimable pro-rata by eligible backers.";
  return "Campaign is complete. All milestone escrow has been released through V2 gates.";
}

export default function Home() {
  const publicConfig = usePublicConfig();
  const networkGuard = useNetworkGuard();
  const explorer = publicConfig.bscscanBase || "https://testnet.bscscan.com";
  const setupMode = !publicConfig.isConfigured;
  const noConfiguredFactory = publicConfig.factoryAddress.toLowerCase() === ZERO_ADDRESS;

  const [token, setToken] = useState<`0x${string}` | null>(null);
  const [factoryArbitrator, setFactoryArbitrator] = useState<`0x${string}` | null>(null);
  const [factoryVersion, setFactoryVersion] = useState<string | null>(null);
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [tokenSymbol, setTokenSymbol] = useState("TES");
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
      setFactoryVersion(null);
      setFactoryArbitrator(null);
      if (!publicConfig.isConfigured) {
        setLoading(false);
        setToken(null);
        setAddresses([]);
        setSelected(null);
        return;
      }
      try {
        setLoading(true);
        const index = await readFactoryIndex();
        if (cancelled) return;
        setToken(index.token as `0x${string}`);
        setFactoryArbitrator(index.arbitrator as `0x${string}`);
        setFactoryVersion(index.version);
        setAddresses(index.addresses);
        setSelected(index.addresses[0] ?? null);
      } catch (error) {
        if (cancelled) return;
        setErr(error instanceof Error ? error.message : String(error));
        setAddresses([]);
        setSelected(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadFactory();
    return () => { cancelled = true; };
  }, [publicConfig.chainId, publicConfig.factoryAddress, publicConfig.isConfigured, publicConfig.rpcUrl, publicConfig.tokenAddress]);

  const tokenAddress = token && token.toLowerCase() !== ZERO_ADDRESS
    ? token
    : publicConfig.tokenAddress !== ZERO_ADDRESS
      ? publicConfig.tokenAddress as `0x${string}`
      : null;

  useEffect(() => {
    let cancelled = false;
    async function loadTokenMetadata() {
      if (!tokenAddress || !publicConfig.isConfigured) return;
      try {
        const client = getPublicClient();
        const [decimals, symbol] = await Promise.all([
          client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" }),
          client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "symbol" }),
        ]);
        if (!cancelled) {
          setTokenDecimals(Number(decimals));
          setTokenSymbol(String(symbol));
        }
      } catch {
        if (!cancelled) {
          setTokenDecimals(18);
          setTokenSymbol("configured token");
        }
      }
    }
    void loadTokenMetadata();
    return () => { cancelled = true; };
  }, [publicConfig.isConfigured, tokenAddress]);

  const formatToken = useCallback((value: bigint) => {
    const text = formatUnits(value, tokenDecimals);
    const numeric = Number(text);
    return Number.isFinite(numeric)
      ? `${numeric.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${tokenSymbol}`
      : `${text} ${tokenSymbol}`;
  }, [tokenDecimals, tokenSymbol]);

  const refreshSelectedCampaign = useCallback(async (address?: `0x${string}` | null) => {
    const useAddress = address ?? selected;
    if (!useAddress || !publicConfig.isConfigured) return;
    try {
      const nextCampaign = await readCampaign(useAddress);
      setCampaign(nextCampaign);
      setErr(null);
    } catch (error) {
      setCampaign(null);
      setErr(error instanceof Error ? error.message : String(error));
    }
  }, [publicConfig.isConfigured, selected]);

  useEffect(() => {
    if (!selected || !publicConfig.isConfigured) {
      setCampaign(null);
      return;
    }
    setCampaign(null);
    void refreshSelectedCampaign(selected);
  }, [publicConfig.isConfigured, refreshSelectedCampaign, selected]);

  const showDemoCampaigns = !loading && noConfiguredFactory && addresses.length === 0;
  const selectedDemo = showDemoCampaigns
    ? demoCampaigns.find((item) => item.id === selectedDemoId) ?? demoCampaigns[0]
    : null;
  const selectedView: SelectedCampaign | null = selectedDemo
    ? { kind: "demo", data: selectedDemo }
    : campaign
      ? { kind: "chain", data: campaign }
      : null;

  const baseWriteDisabledReason = setupMode
    ? "Setup required: configure RPC, V2 factory and token before sending transactions."
    : networkGuard.blockWrites
      ? networkGuard.message || "Switch to the configured network before sending transactions."
      : factoryVersion !== EXPECTED_FACTORY_VERSION
        ? `Configured factory has not been verified as ${EXPECTED_FACTORY_VERSION}.`
        : null;

  const contractMismatchReason = selectedView?.kind === "chain" && tokenAddress && factoryArbitrator
    ? selectedView.data.token.toLowerCase() !== tokenAddress.toLowerCase()
      ? "Campaign token does not match the configured V2 factory token. Writes are disabled."
      : selectedView.data.arbitrator.toLowerCase() !== factoryArbitrator.toLowerCase()
        ? "Campaign arbitrator does not match the configured V2 factory arbitrator. Writes are disabled."
        : null
    : null;

  const writeDisabledReason = selectedView?.kind === "demo"
    ? "Demo/local campaigns never permit wallet writes."
    : contractMismatchReason || baseWriteDisabledReason;

  const fundingDisabledReason = selectedView?.kind === "chain"
    ? writeDisabledReason
      || (selectedView.data.state !== 0 ? "Campaign is no longer in the funding state." : null)
      || (BigInt(Math.floor(Date.now() / 1000)) > selectedView.data.deadline ? "Immutable funding deadline has passed." : null)
      || (selectedView.data.remainingToGoal === 0n ? "Campaign hard cap has been reached." : null)
    : writeDisabledReason;

  return (
    <main className="alpha-shell">
      <div className="alpha-container">
        <header className="alpha-header">
          <div>
            <p className="eyebrow">V2 security remediation</p>
            <h1>TES Crowdfund</h1>
            <p>CampaignV2 funding, evidence gates, contributor challenge, dispute recovery and refunds. Browser writes remain disabled unless the configured factory and campaign agree on V2 trust anchors.</p>
          </div>
          <div className="alpha-actions"><WalletBar /><ConnectWallet /></div>
        </header>

        <AlphaNavigation active="deployed" />
        <NetworkGuard />
        <SetupBanner />

        <section className="trust-grid" aria-label="V2 trust boundaries">
          <div className="trust-note"><strong>Factory version</strong><span>{factoryVersion ?? (setupMode ? "not configured" : "not verified")}</span></div>
          <div className="trust-note"><strong>Escrow token</strong><span>{tokenAddress ? `${tokenSymbol} ${short(tokenAddress)}` : "not configured"}</span></div>
          <div className="trust-note"><strong>Arbitrator</strong><span>{factoryArbitrator ? short(factoryArbitrator) : "not verified"}. Arbitration is only reachable after contributor challenge threshold is met.</span></div>
          <div className="trust-note"><strong>Write policy</strong><span>{baseWriteDisabledReason ?? "Configured V2 factory and network checks currently pass."}</span></div>
        </section>

        <section className="quick-grid" aria-label="Workspace shortcuts">
          <div className="panel"><h2>Setup</h2><p className="section-subtitle">Configure BSC testnet V2 addresses.</p><Link className="button-link" href="/setup">Open setup</Link></div>
          <div className="panel"><h2>Campaigns</h2><p className="section-subtitle">Creator submissions and independently verified publication.</p><div className="button-row"><Link className="button-link" href="/campaigns">Submissions</Link><Link className="button-primary" href="/campaigns/new">New draft</Link></div></div>
          <div className="panel"><h2>Admin</h2><p className="section-subtitle">Moderation and protected audit views.</p><Link className="button-link" href="/admin">Open admin</Link></div>
        </section>

        <PublishedCampaigns />

        <section id="deployed-campaigns" className="panel">
          <div className="campaign-title-row">
            <div>
              <p className="eyebrow">Deployed campaigns</p>
              <h2>CampaignV2 explorer</h2>
              <p className="section-subtitle">{showDemoCampaigns ? "No factory configured: local V2-shaped examples only." : "Only a factory reporting the expected V2 version is accepted by this explorer."}</p>
            </div>
            {showDemoCampaigns && <span className="badge badge-demo">demo only</span>}
          </div>

          <div className="stats-grid" style={{ marginTop: 16 }}>
            <div className="stat-card"><span className="stat-label">Factory</span><span className="stat-value">{noConfiguredFactory ? "not configured" : <AddressValue address={publicConfig.factoryAddress as `0x${string}`} explorer={explorer} linked />}</span></div>
            <div className="stat-card"><span className="stat-label">Version</span><span className="stat-value">{factoryVersion ?? "unverified"}</span></div>
            <div className="stat-card"><span className="stat-label">Campaigns</span><span className="stat-value">{showDemoCampaigns ? `${demoCampaigns.length} demo` : addresses.length}</span></div>
          </div>

          {err && <div className="panel-danger" style={{ marginTop: 14 }}>{err}</div>}
          {loading && <div className="empty-state" style={{ marginTop: 14 }}>Loading V2 factory...</div>}
          {!loading && !showDemoCampaigns && addresses.length === 0 && <div className="empty-state" style={{ marginTop: 14 }}>No CampaignV2 deployments were returned by the verified factory.</div>}

          {(showDemoCampaigns || addresses.length > 0) && (
            <div className="campaign-layout" style={{ marginTop: 16 }}>
              <div className="campaign-list" aria-label="Campaign list">
                {showDemoCampaigns
                  ? demoCampaigns.map((item) => (
                      <button key={item.id} type="button" className={`campaign-list-button${item.id === selectedDemo?.id ? " active" : ""}`} onClick={() => setSelectedDemoId(item.id)}>
                        <span className="badge badge-demo">demo</span><div style={{ marginTop: 8, fontWeight: 800 }}>{item.title}</div><div className="small muted">{item.category}</div>
                      </button>
                    ))
                  : addresses.map((address, index) => (
                      <button key={address} type="button" className={`campaign-list-button${address === selected ? " active" : ""}`} onClick={() => setSelected(address)}>
                        <span className="badge badge-muted">V2 #{index + 1}</span><div style={{ marginTop: 8, fontWeight: 800 }}>{short(address)}</div><div className="small muted">On-chain campaign</div>
                      </button>
                    ))}
              </div>

              <div className="panel">
                {!selectedView && <div className="empty-state">Select a campaign.</div>}
                {selectedView && (
                  <>
                    <div className="campaign-title-row">
                      <div>
                        {selectedView.kind === "demo" && <span className="badge badge-demo">demo only</span>}
                        <h2>{selectedView.kind === "demo" ? selectedView.data.title : `Campaign ${short(selectedView.data.address)}`}</h2>
                        <p className="section-subtitle">{selectedView.data.description}</p>
                      </div>
                      <AddressValue address={selectedView.data.address} explorer={explorer} linked={selectedView.kind === "chain"} />
                    </div>

                    <div className="detail-grid">
                      <div className="detail-item"><strong>State</strong>{CAMPAIGN_STATE_LABELS[selectedView.data.state]}</div>
                      <div className="detail-item"><strong>Raised</strong>{formatToken(selectedView.data.totalContributed)}</div>
                      <div className="detail-item"><strong>Goal</strong>{formatToken(selectedView.data.goal)}</div>
                      <div className="detail-item"><strong>Remaining to cap</strong>{formatToken(selectedView.data.remainingToGoal)}</div>
                      <div className="detail-item"><strong>Released</strong>{formatToken(selectedView.data.totalReleased)}</div>
                      <div className="detail-item"><strong>Refunded</strong>{formatToken(selectedView.data.totalRefunded)}</div>
                      <div className="detail-item"><strong>Funding deadline</strong>{formatTime(selectedView.data.deadline)}</div>
                      <div className="detail-item"><strong>Owner</strong><AddressValue address={selectedView.data.owner} explorer={explorer} linked={selectedView.kind === "chain"} /></div>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div className="split-row"><strong>{progressPercent(selectedView.data).toFixed(1)}% funded</strong><span className="small muted">Milestones total {formatToken(getMilestoneTotal(selectedView.data.milestones))}</span></div>
                      <div className="progress-track" aria-hidden="true"><div className="progress-bar" style={{ width: `${progressPercent(selectedView.data)}%` }} /></div>
                    </div>

                    <div className="trust-grid" style={{ marginTop: 12 }}>
                      <div className="trust-note"><strong>Lifecycle</strong><span>{lifecycleCopy(selectedView.data)}</span></div>
                      <div className="trust-note"><strong>Hard cap</strong><span>CampaignV2 can accept no more than the exact goal; excess requested in the final contribution stays in the wallet.</span></div>
                      <div className="trust-note"><strong>Contract match</strong><span>{selectedView.kind === "demo" ? "Demo data only." : contractMismatchReason ?? "Campaign token and arbitrator match the configured V2 factory."}</span></div>
                    </div>

                    {selectedView.kind === "chain" && tokenAddress ? (
                      <FundCampaign
                        token={tokenAddress}
                        campaignAddress={selectedView.data.address}
                        remainingToGoal={selectedView.data.remainingToGoal}
                        onContributed={() => refreshSelectedCampaign(selectedView.data.address)}
                        disabled={Boolean(fundingDisabledReason)}
                        disabledReason={fundingDisabledReason ?? undefined}
                      />
                    ) : (
                      <DisabledAction title="Funding disabled" reason={writeDisabledReason || "Token not configured."} />
                    )}

                    <div style={{ marginTop: 18 }}>
                      <div className="split-row"><h3 style={{ margin: 0 }}>Milestones</h3>{selectedView.kind === "demo" && <span className="small muted">{selectedView.data.statusNote}</span>}</div>
                      <div className="milestone-list" style={{ marginTop: 10 }}>
                        {selectedView.data.milestones.map((milestone, index) => (
                          <div className="milestone-item" key={`${milestone.description}-${index}`}>
                            <div className="split-row">
                              <div><strong>#{index + 1} {milestone.description}</strong><div className="small muted">{formatToken(milestone.amount)}</div></div>
                              <span className={`badge ${milestone.status === 3 ? "badge-success" : milestone.status === 2 ? "badge-warning" : "badge-muted"}`}>{MILESTONE_STATUS_LABELS[milestone.status]}</span>
                            </div>
                            {milestone.status !== 0 && (
                              <div className="detail-grid" style={{ marginTop: 8 }}>
                                <div className="detail-item"><strong>Evidence</strong>{milestone.evidenceURI || "not recorded"}</div>
                                <div className="detail-item"><strong>Review deadline</strong>{formatTime(milestone.challengeDeadline)}</div>
                                <div className="detail-item"><strong>Approve weight</strong>{formatToken(milestone.approvalWeight)}</div>
                                <div className="detail-item"><strong>Challenge weight</strong>{formatToken(milestone.challengeWeight)}</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedView.kind === "chain" ? (
                      <CampaignV2Actions campaign={selectedView.data} disabledReason={writeDisabledReason} onChanged={() => refreshSelectedCampaign(selectedView.data.address)} />
                    ) : (
                      <DisabledAction title="V2 actions disabled" reason="Demo campaigns do not invoke contracts." />
                    )}
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
