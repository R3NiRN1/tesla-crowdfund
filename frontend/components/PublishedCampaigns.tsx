"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, type ContractFunctionParameters } from "viem";
import { useReadContracts } from "wagmi";

import {
  BackendClientError,
  getBackendUrl,
  listPublicCampaigns,
  type PublicCampaign,
} from "@/lib/backendClient";
import { campaignAbi } from "@/lib/campaignAbi";
import { CAMPAIGN_STATE_LABELS, MILESTONE_STATUS_LABELS, type CampaignState, type MilestoneStatus } from "@/lib/readCampaign";

type CampaignReadContract = ContractFunctionParameters & { chainId: number };
type ListingFilter = "all" | "verified" | "unverified" | "testnet" | "mainnet";
type ListingSort = "newest" | "deadline" | "goal";

function short(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatTes(value: string | bigint) {
  try {
    const text = formatUnits(BigInt(value), 18);
    const numeric = Number(text);
    return Number.isFinite(numeric) ? `${numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })} TES` : `${text} TES`;
  } catch {
    return `${value} base units`;
  }
}

function formatDeadline(value: string | bigint) {
  const milliseconds = Number(BigInt(value) * 1000n);
  return Number.isSafeInteger(milliseconds) ? new Date(milliseconds).toLocaleDateString() : String(value);
}

function explorerBase(chainId: number) {
  if (chainId === 97) return "https://testnet.bscscan.com";
  if (chainId === 56) return "https://bscscan.com";
  return null;
}

function chainLabel(chainId: number) {
  if (chainId === 97) return "BSC testnet";
  if (chainId === 56) return "BSC mainnet";
  return `chain ${chainId}`;
}

function addressUrl(chainId: number, address: string) {
  const explorer = explorerBase(chainId);
  return explorer ? `${explorer}/address/${address}` : null;
}

function transactionUrl(campaign: PublicCampaign) {
  const explorer = explorerBase(campaign.chainId);
  return explorer ? `${explorer}/tx/${campaign.transactionHash}` : null;
}

function statePresentation(state: CampaignState | null) {
  if (state === null) return { label: "V2 state unavailable", className: "badge-muted" };
  if (state === 0) return { label: "funding", className: "badge-success" };
  if (state === 1) return { label: "milestone escrow", className: "badge-warning" };
  if (state === 2) return { label: "refunds", className: "badge-warning" };
  return { label: "complete", className: "badge-success" };
}

function nextAction(state: CampaignState | null) {
  if (state === 0) return "Funding is open subject to the immutable deadline and exact hard cap.";
  if (state === 1) return "Track the current evidence gate, contributor review/challenge and any dispute state before expecting release.";
  if (state === 2) return "Unreleased escrow is in the terminal pro-rata refund path for eligible backers.";
  if (state === 3) return "All scheduled milestone escrow has been released through V2 gates.";
  return "Chain state could not be read. Do not rely on the listing alone; inspect the contract before taking action.";
}

function verificationCopy(state: PublicCampaign["creatorVerification"]) {
  return state === "manually_verified"
    ? { label: "creator manually verified", className: "badge-success", detail: "An admin recorded manual creator/submission checks. This is platform review, not third-party KYC." }
    : { label: "creator unverified", className: "badge-warning", detail: "No manual verification record is attached." };
}

function fundingProgress(goal: bigint | undefined, totalContributed: bigint | undefined) {
  if (goal === undefined || totalContributed === undefined || goal <= 0n) return null;
  const percent = totalContributed >= goal ? 100 : Number((totalContributed * 10000n) / goal) / 100;
  return { percent, label: `${percent.toFixed(1)}% funded` };
}

function sortableBigInt(value: string) {
  try { return BigInt(value); } catch { return 0n; }
}

function compareBigInt(left: bigint, right: bigint) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function PublishedCampaignCard({ campaign }: { campaign: PublicCampaign }) {
  const readConfig = useMemo(() => {
    const contracts: CampaignReadContract[] = [
      { address: campaign.campaignAddress, abi: campaignAbi, functionName: "state", chainId: campaign.chainId },
      { address: campaign.campaignAddress, abi: campaignAbi, functionName: "goal", chainId: campaign.chainId },
      { address: campaign.campaignAddress, abi: campaignAbi, functionName: "deadline", chainId: campaign.chainId },
      { address: campaign.campaignAddress, abi: campaignAbi, functionName: "totalContributed", chainId: campaign.chainId },
      { address: campaign.campaignAddress, abi: campaignAbi, functionName: "totalReleased", chainId: campaign.chainId },
      ...campaign.milestones.map((_, index) => ({
        address: campaign.campaignAddress,
        abi: campaignAbi,
        functionName: "milestones" as const,
        args: [BigInt(index)] as const,
        chainId: campaign.chainId,
      })),
    ];
    return contracts;
  }, [campaign]);

  const { data: reads } = useReadContracts({ allowFailure: true, contracts: readConfig, query: { refetchInterval: 30_000 } });
  const rawState = reads?.[0]?.result;
  const state = typeof rawState === "number" || typeof rawState === "bigint" ? Number(rawState) as CampaignState : null;
  const goal = typeof reads?.[1]?.result === "bigint" ? reads[1].result : undefined;
  const deadline = typeof reads?.[2]?.result === "bigint" ? reads[2].result : undefined;
  const totalContributed = typeof reads?.[3]?.result === "bigint" ? reads[3].result : undefined;
  const totalReleased = typeof reads?.[4]?.result === "bigint" ? reads[4].result : undefined;
  const milestoneStatuses = campaign.milestones.map((_, index) => {
    const result = reads?.[index + 5]?.result;
    return Array.isArray(result) ? Number(result[2]) as MilestoneStatus : null;
  });

  const lifecycle = statePresentation(state);
  const progress = fundingProgress(goal, totalContributed);
  const verification = verificationCopy(campaign.creatorVerification);
  const txUrl = transactionUrl(campaign);
  const contractUrl = addressUrl(campaign.chainId, campaign.campaignAddress);
  const creatorUrl = addressUrl(campaign.chainId, campaign.creatorAddress);
  const factoryUrl = addressUrl(campaign.chainId, campaign.factoryAddress);

  return (
    <article className="draft-item">
      <div className="split-row">
        <div><strong>{campaign.title}</strong><div className="small muted">{campaign.shortDescription}</div></div>
        <div className="button-row">
          <span className="badge badge-success">chain-verified publish</span>
          <span className={`badge ${verification.className}`}>{verification.label}</span>
          <span className={`badge ${lifecycle.className}`}>{lifecycle.label}</span>
        </div>
      </div>

      <div className="trust-grid" style={{ marginTop: 12 }}>
        <div className="trust-note"><strong>Publication provenance</strong><span>Backend publication is derived from independently verified V2 transaction, event and deployed contract state.</span></div>
        <div className="trust-note"><strong>Creator status</strong><span>{verification.detail}</span></div>
        <div className="trust-note"><strong>V2 next action</strong><span>{nextAction(state)}</span></div>
        <div className="trust-note"><strong>Network</strong><span>{chainLabel(campaign.chainId)}. {campaign.chainId === 97 ? "Rehearsal/testnet assets only." : campaign.chainId === 56 ? "Mainnet would use real assets." : "Unknown network: verify manually."}</span></div>
      </div>

      {progress && (
        <div style={{ marginTop: 14 }}>
          <div className="split-row"><strong>{progress.label}</strong><span className="small muted">{state === null ? "state unavailable" : CAMPAIGN_STATE_LABELS[state]}</span></div>
          <div className="progress-track" aria-hidden="true"><div className="progress-bar" style={{ width: `${progress.percent}%` }} /></div>
        </div>
      )}

      <div className="detail-grid">
        <div className="detail-item"><strong>Raised on-chain</strong>{totalContributed === undefined ? "unavailable" : formatTes(totalContributed)}</div>
        <div className="detail-item"><strong>Released on-chain</strong>{totalReleased === undefined ? "unavailable" : formatTes(totalReleased)}</div>
        <div className="detail-item"><strong>Goal</strong>{formatTes(goal ?? BigInt(campaign.goal))}</div>
        <div className="detail-item"><strong>Deadline</strong>{formatDeadline(deadline ?? BigInt(campaign.deadline))}</div>
        <div className="detail-item"><strong>Creator</strong>{creatorUrl ? <a href={creatorUrl} target="_blank" rel="noreferrer">{short(campaign.creatorAddress)}</a> : short(campaign.creatorAddress)}</div>
        <div className="detail-item"><strong>Campaign</strong>{contractUrl ? <a href={contractUrl} target="_blank" rel="noreferrer">{short(campaign.campaignAddress)}</a> : short(campaign.campaignAddress)}</div>
        <div className="detail-item"><strong>Factory</strong>{factoryUrl ? <a href={factoryUrl} target="_blank" rel="noreferrer">{short(campaign.factoryAddress)}</a> : short(campaign.factoryAddress)}</div>
        <div className="detail-item"><strong>Chain</strong>{campaign.chainId}</div>
      </div>

      <div className="timeline" style={{ marginTop: 14 }}>
        <h3>Updates and milestone gates</h3>
        {campaign.timeline.map((item) => {
          const milestone = item.milestoneIndex === null ? null : campaign.milestones[item.milestoneIndex];
          const milestoneStatus = item.milestoneIndex === null ? null : milestoneStatuses[item.milestoneIndex];
          return (
            <div className="timeline-item" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <div className="small muted">{item.detail}</div>
                {milestone && <div className="small muted">Amount: {formatTes(milestone.amount)}</div>}
                {item.timestamp && <div className="small muted">{new Date(item.timestamp).toLocaleString()}</div>}
              </div>
              <span className={`badge ${milestoneStatus === 3 ? "badge-success" : milestoneStatus === 2 ? "badge-warning" : "badge-muted"}`}>
                {item.type === "milestone" && milestoneStatus !== null ? MILESTONE_STATUS_LABELS[milestoneStatus] : item.source}
              </span>
            </div>
          );
        })}
      </div>

      <div className="button-row" style={{ marginTop: 12 }}>
        {txUrl ? <a href={txUrl} target="_blank" rel="noreferrer">Publish tx {short(campaign.transactionHash)}</a> : <span className="small muted">Publish tx {short(campaign.transactionHash)}</span>}
        <a href={campaign.metadataURI} target="_blank" rel="noreferrer">Metadata proof</a>
        <span className="small muted">Published {new Date(campaign.publishedAt).toLocaleString()}</span>
      </div>
    </article>
  );
}

export default function PublishedCampaigns() {
  const backendUrl = getBackendUrl();
  const [campaigns, setCampaigns] = useState<PublicCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listingFilter, setListingFilter] = useState<ListingFilter>("all");
  const [listingSort, setListingSort] = useState<ListingSort>("newest");

  const refresh = useCallback(async () => {
    if (!backendUrl) return;
    setLoading(true);
    try {
      setCampaigns(await listPublicCampaigns());
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof BackendClientError ? requestError.message : "Published campaigns could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visibleCampaigns = useMemo(() => [...campaigns]
    .filter((campaign) => {
      if (listingFilter === "verified") return campaign.creatorVerification === "manually_verified";
      if (listingFilter === "unverified") return campaign.creatorVerification === "unverified";
      if (listingFilter === "testnet") return campaign.chainId === 97;
      if (listingFilter === "mainnet") return campaign.chainId === 56;
      return true;
    })
    .sort((left, right) => {
      if (listingSort === "deadline") return compareBigInt(sortableBigInt(left.deadline), sortableBigInt(right.deadline));
      if (listingSort === "goal") return compareBigInt(sortableBigInt(right.goal), sortableBigInt(left.goal));
      return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
    }), [campaigns, listingFilter, listingSort]);

  return (
    <section className="panel" aria-label="Backend published campaigns">
      <div className="split-row">
        <div><p className="eyebrow">Published campaigns</p><h2>Verified public listing</h2><p className="section-subtitle">Only backend-published records appear here; V2 lifecycle status is read from the deployed campaign.</p></div>
        <button type="button" className="button-secondary" onClick={() => void refresh()} disabled={!backendUrl || loading}>{loading ? "Refreshing..." : "Refresh"}</button>
      </div>

      {!backendUrl && <div className="panel-warning" style={{ marginTop: 14 }}>Set NEXT_PUBLIC_BACKEND_URL to load published records.</div>}
      {error && <div className="panel-danger" style={{ marginTop: 14 }}>{error}</div>}
      {backendUrl && campaigns.length > 0 && (
        <div className="form-grid" style={{ marginTop: 14 }}>
          <label className="form-field">Filter<select value={listingFilter} onChange={(event) => setListingFilter(event.target.value as ListingFilter)}><option value="all">All published</option><option value="verified">Manually verified creators</option><option value="unverified">Unverified creators</option><option value="testnet">BSC testnet</option><option value="mainnet">BSC mainnet</option></select></label>
          <label className="form-field">Sort<select value={listingSort} onChange={(event) => setListingSort(event.target.value as ListingSort)}><option value="newest">Newest publish record</option><option value="deadline">Deadline soonest</option><option value="goal">Largest goal</option></select></label>
          <div className="trust-note"><strong>{visibleCampaigns.length} shown</strong><span>Draft and moderation records remain private.</span></div>
        </div>
      )}
      {backendUrl && !loading && campaigns.length === 0 && <div className="empty-state" style={{ marginTop: 14 }}>No published backend campaigns yet.</div>}
      <div className="draft-list" style={{ marginTop: 14 }}>{visibleCampaigns.map((campaign) => <PublishedCampaignCard key={campaign.id} campaign={campaign} />)}</div>
    </section>
  );
}
