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
          <strong>Metadata proof</strong>
          <span>{metadataKind(campaign.metadataURI)} saved on the approved backend record and linked below for inspection.</span>
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
            Published records only. Cards separate platform review from contract evidence for funding, refunds, and milestones.
          </p>
        </div>
        <button type="button" className="button-secondary" onClick={() => void refresh()} disabled={!backendUrl || loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {!backendUrl && <div className="panel-warning" style={{ marginTop: 14 }}>Set NEXT_PUBLIC_BACKEND_URL to load the public read model.</div>}
      {error && <div className="panel-danger" style={{ marginTop: 14 }}>{error}</div>}
      {backendUrl && !loading && campaigns.length === 0 && (
        <div className="empty-state" style={{ marginTop: 14 }}>No published backend campaigns yet. Draft, review, rejected, needs-changes, and approved-unpublished records stay hidden.</div>
      )}

      <div className="draft-list" style={{ marginTop: 14 }}>
        {campaigns.map((campaign) => <PublishedCampaignCard key={campaign.id} campaign={campaign} />)}
      </div>
    </section>
  );
}
