"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUnits } from "viem";

import {
  BackendClientError,
  getBackendUrl,
  listPublicCampaigns,
  type PublicCampaign,
} from "@/lib/backendClient";

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
        {campaigns.map((campaign) => {
          const txUrl = transactionUrl(campaign);
          return (
            <article key={campaign.id} className="draft-item">
              <div className="split-row">
                <div>
                  <strong>{campaign.title}</strong>
                  <div className="small muted">{campaign.shortDescription}</div>
                </div>
                <div className="button-row">
                  <span className="badge badge-success">published</span>
                  <span className={`badge ${campaign.creatorVerification === "manually_verified" ? "badge-success" : "badge-muted"}`}>
                    creator {campaign.creatorVerification.replace("_", " ")}
                  </span>
                </div>
              </div>

              <div className="detail-grid">
                <div className="detail-item"><strong>Goal</strong>{formatTes(campaign.goal)}</div>
                <div className="detail-item"><strong>Deadline</strong>{formatDeadline(campaign.deadline)}</div>
                <div className="detail-item"><strong>Creator</strong>{short(campaign.creatorAddress)}</div>
                <div className="detail-item"><strong>Campaign</strong>{short(campaign.campaignAddress)}</div>
              </div>

              <div className="milestone-list" style={{ marginTop: 12 }}>
                {campaign.milestones.map((milestone, index) => (
                  <div className="milestone-item" key={`${campaign.id}-${index}`}>
                    <div className="split-row">
                      <span>{milestone.description}</span>
                      <strong>{formatTes(milestone.amount)}</strong>
                    </div>
                  </div>
                ))}
              </div>

              <div className="button-row" style={{ marginTop: 12 }}>
                {txUrl && <a href={txUrl} target="_blank" rel="noreferrer">Transaction {short(campaign.transactionHash)}</a>}
                <a href={campaign.metadataURI} target="_blank" rel="noreferrer">Metadata</a>
                <span className="small muted">Published {new Date(campaign.publishedAt).toLocaleString()}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
