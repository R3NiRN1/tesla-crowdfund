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

function transactionUrl(campaign: PublicCampaign) {
  if (campaign.chainId === 97) return `https://testnet.bscscan.com/tx/${campaign.transactionHash}`;
  if (campaign.chainId === 56) return `https://bscscan.com/tx/${campaign.transactionHash}`;
  return null;
}

function statusBadge(
  deadline: bigint | undefined,
  goal: bigint | undefined,
  totalContributed: bigint | undefined,
  claimedMilestones: boolean[],
) {
  if (deadline === undefined || goal === undefined || totalContributed === undefined) {
    return { label: "chain status unavailable", className: "badge-muted" };
  }

  const expired = BigInt(Math.floor(Date.now() / 1000)) > deadline;
  const goalMet = totalContributed >= goal;
  if (!expired && !goalMet) return { label: "funding active", className: "badge-success" };
  if (!expired && goalMet) return { label: "goal reached", className: "badge-success" };
  if (!goalMet) return { label: "failed / refunds eligible", className: "badge-warning" };
  if (claimedMilestones.length > 0 && claimedMilestones.every(Boolean)) {
    return { label: "completed", className: "badge-success" };
  }
  return { label: "funded / milestones pending", className: "badge-warning" };
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
  const txUrl = transactionUrl(campaign);

  return (
    <article className="draft-item">
      <div className="split-row">
        <div>
          <strong>{campaign.title}</strong>
          <div className="small muted">{campaign.shortDescription}</div>
        </div>
        <div className="button-row">
          <span className="badge badge-success">contract published</span>
          <span className="badge badge-success">manual platform review</span>
          <span className={`badge ${lifecycle.className}`}>{lifecycle.label}</span>
        </div>
      </div>

      <div className="trust-grid" style={{ marginTop: 12 }}>
        <div className="trust-note">
          <strong>Platform-reviewed</strong>
          <span>Manual alpha review of submitted campaign and creator details. This is not identity verification or production KYC.</span>
        </div>
        <div className="trust-note">
          <strong>On-chain evidence</strong>
          <span>Publication, funding totals, deadline, refund eligibility, and milestone claims come from the campaign contract.</span>
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

      <div className="detail-grid">
        <div className="detail-item"><strong>Raised on-chain</strong>{totalContributed === undefined ? "unavailable" : formatTes(totalContributed.toString())}</div>
        <div className="detail-item"><strong>Goal</strong>{formatTes((goal ?? BigInt(campaign.goal)).toString())}</div>
        <div className="detail-item"><strong>Deadline</strong>{formatDeadline((deadline ?? BigInt(campaign.deadline)).toString())}</div>
        <div className="detail-item"><strong>Creator</strong>{short(campaign.creatorAddress)}</div>
        <div className="detail-item"><strong>Campaign</strong>{short(campaign.campaignAddress)}</div>
      </div>

      <div className="timeline" style={{ marginTop: 14 }}>
        <h3>Updates and milestones</h3>
        {campaign.timeline.map((item) => {
          const milestoneClaimed = item.milestoneIndex === null ? false : claimedMilestones[item.milestoneIndex];
          return (
            <div className="timeline-item" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <div className="small muted">{item.detail}</div>
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
        {txUrl && <a href={txUrl} target="_blank" rel="noreferrer">Transaction {short(campaign.transactionHash)}</a>}
        <a href={campaign.metadataURI} target="_blank" rel="noreferrer">Metadata</a>
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

  return (
    <section className="panel" aria-label="Backend published campaigns">
      <div className="split-row">
        <div>
          <p className="eyebrow">Published campaigns</p>
          <h2>Backend public listing</h2>
          <p className="section-subtitle">
            Published records only. Draft, review, rejected, needs-changes, and approved-unpublished submissions are hidden.
          </p>
        </div>
        <button type="button" className="button-secondary" onClick={() => void refresh()} disabled={!backendUrl || loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {!backendUrl && <div className="panel-warning" style={{ marginTop: 14 }}>Set NEXT_PUBLIC_BACKEND_URL to load the public read model.</div>}
      {error && <div className="panel-danger" style={{ marginTop: 14 }}>{error}</div>}
      {backendUrl && !loading && campaigns.length === 0 && (
        <div className="empty-state" style={{ marginTop: 14 }}>No published backend campaigns yet.</div>
      )}

      <div className="draft-list" style={{ marginTop: 14 }}>
        {campaigns.map((campaign) => <PublishedCampaignCard key={campaign.id} campaign={campaign} />)}
      </div>
    </section>
  );
}
