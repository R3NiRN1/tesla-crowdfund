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

type CampaignReadContract = ContractFunctionParameters & { chainId: number };
type ContractLifecycleStatus = "unavailable" | "active" | "goal_reached" | "refunds" | "completed" | "milestones_pending";
type ListingFilter = "all" | "verified" | "unverified" | "testnet" | "mainnet";
type ListingSort = "newest" | "deadline" | "goal";

function short(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function formatTes(value: string) {
  try {
    return `${Number(formatUnits(BigInt(value), 18)).toLocaleString(undefined, { maximumFractionDigits: 2 })} TES`;
  } catch {
    return `${value} base units`;
  }
}

function formatDeadline(value: string) {
  const milliseconds = Number(BigInt(value) * 1000n);
  return Number.isSafeInteger(milliseconds) ? new Date(milliseconds).toLocaleDateString() : value;
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

function transactionUrl(campaign: PublicCampaign) {
  const explorer = explorerBase(campaign.chainId);
  return explorer ? `${explorer}/tx/${campaign.transactionHash}` : null;
}

function addressUrl(chainId: number, address: string) {
  const explorer = explorerBase(chainId);
  return explorer ? `${explorer}/address/${address}` : null;
}

function metadataKind(uri: string) {
  if (uri.startsWith("ipfs://")) return "IPFS metadata URI";
  if (uri.startsWith("ar://")) return "Arweave metadata URI";
  if (uri.startsWith("https://")) return "HTTPS metadata URI";
  return "metadata URI";
}

function chainBoundaryCopy(chainId: number) {
  if (chainId === 97) return "Testnet mode: use rehearsal funds only and expect resets or redeploys before mainnet.";
  if (chainId === 56) return "Mainnet mode: wallet actions use real assets. Verify addresses, links, and prompts before signing.";
  return "Unknown network mode: inspect the chain ID and contract addresses before taking wallet action.";
}

function verificationCopy(state: PublicCampaign["creatorVerification"]) {
  if (state === "manually_verified") {
    return {
      label: "creator manually verified",
      className: "badge-success",
      detail: "An admin recorded manual creator and submission checks. This is platform review, not third-party KYC.",
    };
  }

  return {
    label: "creator unverified",
    className: "badge-warning",
    detail: "No manual verification record is attached. Treat platform review as limited campaign moderation.",
  };
}

function statusBadge(
  deadline: bigint | undefined,
  goal: bigint | undefined,
  totalContributed: bigint | undefined,
  claimedMilestones: boolean[],
): { status: ContractLifecycleStatus; label: string; className: string } {
  if (deadline === undefined || goal === undefined || totalContributed === undefined) {
    return { status: "unavailable", label: "chain status unavailable", className: "badge-muted" };
  }

  const expired = BigInt(Math.floor(Date.now() / 1000)) > deadline;
  const goalMet = totalContributed >= goal;
  if (!expired && !goalMet) return { status: "active", label: "funding active", className: "badge-success" };
  if (!expired && goalMet) return { status: "goal_reached", label: "goal reached", className: "badge-success" };
  if (!goalMet) return { status: "refunds", label: "failed / refunds eligible", className: "badge-warning" };
  if (claimedMilestones.length > 0 && claimedMilestones.every(Boolean)) {
    return { status: "completed", label: "completed", className: "badge-success" };
  }
  return { status: "milestones_pending", label: "funded / milestones pending", className: "badge-warning" };
}

function fundingProgress(goal: bigint | undefined, totalContributed: bigint | undefined) {
  if (goal === undefined || totalContributed === undefined || goal <= 0n) return null;
  const percent = totalContributed >= goal ? 100 : Number((totalContributed * 10000n) / goal) / 100;
  return { percent, label: `${percent.toFixed(1)}% funded` };
}

function backerNextAction(status: ContractLifecycleStatus) {
  if (status === "active") return "Review creator status, metadata proof, contract address, deadline, and wallet network before contributing.";
  if (status === "goal_reached") return "Funding target is met. Track milestone claims and creator updates before expecting delivery.";
  if (status === "refunds") return "Deadline passed below goal. Refund eligibility is contract-based for contributors; inspect the contract history.";
  if (status === "completed") return "Milestones are claimed. Treat future activity as post-funding reporting.";
  if (status === "milestones_pending") return "Campaign is funded. Track creator milestone claims; funds move only through contract calls.";
  return "Chain reads are unavailable. Refresh or inspect the contract directly before making a funding decision.";
}

function sortableBigInt(value: string) {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function compareBigInt(left: bigint, right: bigint) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function PublishedCampaignCard({ campaign }: { campaign: PublicCampaign }) {
  const readConfig = useMemo(() => {
    const contracts: CampaignReadContract[] = [
      { address: campaign.campaignAddress, abi: campaignAbi, functionName: "goal", chainId: campaign.chainId },
      { address: campaign.campaignAddress, abi: campaignAbi, functionName: "deadline", chainId: campaign.chainId },
      { address: campaign.campaignAddress, abi: campaignAbi, functionName: "totalContributed", chainId: campaign.chainId },
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

  const { data: reads } = useReadContracts({
    allowFailure: true,
    contracts: readConfig,
    query: { refetchInterval: 30_000 },
  });

  const goal = typeof reads?.[0]?.result === "bigint" ? reads[0].result : undefined;
  const deadline = typeof reads?.[1]?.result === "bigint" ? reads[1].result : undefined;
  const totalContributed = typeof reads?.[2]?.result === "bigint" ? reads[2].result : undefined;
  const claimedMilestones = campaign.milestones.map((_, index) => {
    const result = reads?.[index + 3]?.result;
    return Array.isArray(result) && result[2] === true;
  });
  const lifecycle = statusBadge(deadline, goal, totalContributed, claimedMilestones);
  const progress = fundingProgress(goal, totalContributed);
  const verification = verificationCopy(campaign.creatorVerification);
  const txUrl = transactionUrl(campaign);
  const contractUrl = addressUrl(campaign.chainId, campaign.campaignAddress);
  const creatorUrl = addressUrl(campaign.chainId, campaign.creatorAddress);
  const factoryUrl = addressUrl(campaign.chainId, campaign.factoryAddress);

  return (
    <article className="draft-item">
      <div className="split-row">
        <div>
          <strong>{campaign.title}</strong>
          <div className="small muted">{campaign.shortDescription}</div>
        </div>
        <div className="button-row">
          <span className="badge badge-success">contract published</span>
          <span className={`badge ${verification.className}`}>{verification.label}</span>
          <span className={`badge ${lifecycle.className}`}>{lifecycle.label}</span>
        </div>
      </div>

      <div className="trust-grid" style={{ marginTop: 12 }}>
        <div className="trust-note">
          <strong>Creator status</strong>
          <span>{verification.detail}</span>
        </div>
        <div className="trust-note">
          <strong>Platform-reviewed</strong>
          <span>Backend review approved this listing for publication. It does not guarantee delivery, refunds, or identity.</span>
        </div>
        <div className="trust-note">
          <strong>Contract evidence</strong>
          <span>Publication, funding totals, deadline, refund eligibility, and milestone claims come from the campaign contract.</span>
        </div>
        <div className="trust-note">
          <strong>{chainLabel(campaign.chainId)} mode</strong>
          <span>{chainBoundaryCopy(campaign.chainId)}</span>
        </div>
        <div className="trust-note">
          <strong>Metadata proof</strong>
          <span>{metadataKind(campaign.metadataURI)} saved on the approved backend record and linked below for inspection.</span>
        </div>
        <div className="trust-note">
          <strong>Public data</strong>
          <span>Creator address, media references, metadata URI, publish transaction, contract addresses, updates, and milestones are visible after publish.</span>
        </div>
        <div className="trust-note">
          <strong>Backer next action</strong>
          <span>{backerNextAction(lifecycle.status)}</span>
        </div>
      </div>

      {campaign.media.length > 0 && (
        <div className="media-reference-list" style={{ marginTop: 12 }}>
          {campaign.media.map((media) => (
            <a key={media.id} className="media-reference" href={media.uri} target="_blank" rel="noreferrer">
              <span className={`badge ${media.primary ? "badge-success" : "badge-muted"}`}>
                {media.primary ? "primary image" : media.kind}
              </span>
              <span>{media.label || media.altText || media.uri}</span>
            </a>
          ))}
        </div>
      )}

      {progress && (
        <div style={{ marginTop: 14 }}>
          <div className="split-row">
            <strong>{progress.label}</strong>
            <span className="small muted">{lifecycle.label}</span>
          </div>
          <div className="progress-track" aria-hidden="true">
            <div className="progress-bar" style={{ width: `${progress.percent}%` }} />
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Refunds are contract-based after the deadline if the goal is not met. Milestone claims are contract-controlled after funding.
          </div>
        </div>
      )}

      <div className="detail-grid">
        <div className="detail-item"><strong>Campaign status</strong>{lifecycle.label}</div>
        <div className="detail-item"><strong>Raised on-chain</strong>{totalContributed === undefined ? "unavailable" : formatTes(totalContributed.toString())}</div>
        <div className="detail-item"><strong>Goal</strong>{formatTes((goal ?? BigInt(campaign.goal)).toString())}</div>
        <div className="detail-item"><strong>Deadline</strong>{formatDeadline((deadline ?? BigInt(campaign.deadline)).toString())}</div>
        <div className="detail-item"><strong>Creator</strong>{creatorUrl ? <a href={creatorUrl} target="_blank" rel="noreferrer">{short(campaign.creatorAddress)}</a> : short(campaign.creatorAddress)}</div>
        <div className="detail-item"><strong>Contract address</strong>{contractUrl ? <a href={contractUrl} target="_blank" rel="noreferrer">{short(campaign.campaignAddress)}</a> : short(campaign.campaignAddress)}</div>
        <div className="detail-item"><strong>Factory</strong>{factoryUrl ? <a href={factoryUrl} target="_blank" rel="noreferrer">{short(campaign.factoryAddress)}</a> : short(campaign.factoryAddress)}</div>
        <div className="detail-item"><strong>Network</strong>{chainLabel(campaign.chainId)}</div>
      </div>

      <div className="timeline" style={{ marginTop: 14 }}>
        <h3>Updates and milestones</h3>
        {campaign.timeline.map((item) => {
          const milestoneClaimed = item.milestoneIndex === null ? false : claimedMilestones[item.milestoneIndex];
          const milestone = item.milestoneIndex === null ? null : campaign.milestones[item.milestoneIndex];
          return (
            <div className="timeline-item" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <div className="small muted">{item.detail}</div>
                {milestone && <div className="small muted">Amount: {formatTes(milestone.amount)}</div>}
                {item.timestamp && <div className="small muted">{new Date(item.timestamp).toLocaleString()}</div>}
              </div>
              <span className={`badge ${item.type === "milestone" && milestoneClaimed ? "badge-success" : "badge-muted"}`}>
                {item.type === "milestone" ? (milestoneClaimed ? "claimed on-chain" : "planned / unclaimed") : item.source}
              </span>
            </div>
          );
        })}
      </div>

      <div className="button-row" style={{ marginTop: 12 }}>
        {txUrl ? (
          <a href={txUrl} target="_blank" rel="noreferrer">Publish tx {short(campaign.transactionHash)}</a>
        ) : (
          <span className="small muted">Publish tx {short(campaign.transactionHash)}</span>
        )}
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleCampaigns = useMemo(() => {
    return [...campaigns]
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
      });
  }, [campaigns, listingFilter, listingSort]);

  return (
    <section className="panel" aria-label="Backend published campaigns">
      <div className="split-row">
        <div>
          <p className="eyebrow">Published campaigns</p>
          <h2>Backend public listing</h2>
          <p className="section-subtitle">
            Published records only. Cards separate platform review, public campaign data, network mode, and contract evidence for funding, refunds, and milestones.
          </p>
        </div>
        <button type="button" className="button-secondary" onClick={() => void refresh()} disabled={!backendUrl || loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {!backendUrl && <div className="panel-warning" style={{ marginTop: 14 }}>Set NEXT_PUBLIC_BACKEND_URL to load the public read model.</div>}
      {error && <div className="panel-danger" style={{ marginTop: 14 }}>{error}</div>}
      {backendUrl && campaigns.length > 0 && (
        <div className="form-grid" style={{ marginTop: 14 }} aria-label="Published campaign discovery controls">
          <label className="form-field">
            <span>Filter</span>
            <select value={listingFilter} onChange={(event) => setListingFilter(event.target.value as ListingFilter)}>
              <option value="all">All published</option>
              <option value="verified">Manually verified creators</option>
              <option value="unverified">Unverified creators</option>
              <option value="testnet">BSC testnet</option>
              <option value="mainnet">BSC mainnet</option>
            </select>
          </label>
          <label className="form-field">
            <span>Sort</span>
            <select value={listingSort} onChange={(event) => setListingSort(event.target.value as ListingSort)}>
              <option value="newest">Newest publish record</option>
              <option value="deadline">Deadline soonest</option>
              <option value="goal">Largest goal</option>
            </select>
          </label>
          <div className="trust-note">
            <strong>{visibleCampaigns.length} shown</strong>
            <span>Only backend-published campaign records appear here. Filters do not expose drafts or moderation queues.</span>
          </div>
        </div>
      )}
      {backendUrl && !loading && campaigns.length === 0 && (
        <div className="empty-state" style={{ marginTop: 14 }}>No published backend campaigns yet. Draft, review, rejected, needs-changes, and approved-unpublished records stay hidden.</div>
      )}
      {backendUrl && !loading && campaigns.length > 0 && visibleCampaigns.length === 0 && (
        <div className="empty-state" style={{ marginTop: 14 }}>No published campaigns match the current filter.</div>
      )}

      <div className="draft-list" style={{ marginTop: 14 }}>
        {visibleCampaigns.map((campaign) => <PublishedCampaignCard key={campaign.id} campaign={campaign} />)}
      </div>
    </section>
  );
}
