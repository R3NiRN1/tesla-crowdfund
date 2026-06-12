"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import AlphaNavigation from "@/components/AlphaNavigation";
import ApprovedBackendPublish from "@/components/ApprovedBackendPublish";
import ConnectWallet from "@/components/ConnectWallet";
import SetupBanner from "@/components/SetupBanner";
import WalletBar from "@/components/WalletBar";
import {
  BackendClientError,
  getBackendUrl,
  listBackendSubmissions,
  type BackendSubmission,
} from "@/lib/backendClient";
import { buildDraftReadiness, getCampaignDrafts, type CampaignDraft } from "@/lib/localCampaigns";

export default function CampaignsPage() {
  const { address, isConnected } = useAccount();
  const backendUrl = getBackendUrl();
  const [submissions, setSubmissions] = useState<BackendSubmission[]>([]);
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setDrafts(getCampaignDrafts());
    if (!backendUrl) return;
    try {
      setSubmissions(await listBackendSubmissions());
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof BackendClientError ? requestError.message : "Backend submissions could not be loaded.");
    }
  }, [backendUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const creatorSubmissions = address
    ? submissions.filter((submission) => submission.creatorAddress.toLowerCase() === address.toLowerCase())
    : [];

  const updatePublished = (updated: BackendSubmission) => {
    setSubmissions((current) => current.map((submission) => submission.id === updated.id ? updated : submission));
  };

  return (
    <main className="alpha-shell">
      <div className="alpha-container">
        <header className="alpha-header">
          <div>
            <p className="eyebrow">Creator campaigns</p>
            <h1>Campaign submissions</h1>
            <p>Track backend review state and publish approved campaigns through the matching creator wallet.</p>
          </div>
          <div className="alpha-actions">
            <WalletBar />
            <ConnectWallet />
            <Link className="button-primary" href="/campaigns/new">New draft</Link>
          </div>
        </header>

        <AlphaNavigation active="drafts" />
        <SetupBanner />

        {!backendUrl && <div className="panel-warning">Set NEXT_PUBLIC_BACKEND_URL to load backend submissions.</div>}
        {backendUrl && !isConnected && <div className="panel-warning">Connect the creator wallet to view its backend submissions.</div>}
        {error && <div className="panel-danger">{error}</div>}

        <section className="panel">
          <div className="split-row">
            <div>
              <h2>Your backend submissions</h2>
              <p className="section-subtitle">Only approved submissions can call the metadata-aware factory path.</p>
            </div>
            <button type="button" className="button-secondary" onClick={() => void refresh()} disabled={!backendUrl}>Refresh</button>
          </div>

          {isConnected && creatorSubmissions.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 14 }}>No backend submissions found for this wallet.</div>
          ) : (
            <div className="draft-list" style={{ marginTop: 14 }}>
              {creatorSubmissions.map((submission) => (
                <article key={submission.id} className="draft-item">
                  <div className="split-row">
                    <div>
                      <strong>{submission.title || "Untitled campaign"}</strong>
                      <div className="small muted">{submission.shortDescription}</div>
                    </div>
                    <div className="button-row">
                      <span className={`badge ${submission.readiness.state === "contract-ready" ? "badge-success" : "badge-warning"}`}>
                        {submission.readiness.state}
                      </span>
                      <span className={`badge ${["approved", "published"].includes(submission.status) ? "badge-success" : "badge-muted"}`}>
                        {submission.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                  {submission.review?.note && <div className="small muted" style={{ marginTop: 8 }}>Review note: {submission.review.note}</div>}
                  {(submission.status === "approved" || submission.status === "published") && (
                    <ApprovedBackendPublish submission={submission} onPublished={updatePublished} />
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Local drafts (dev fallback)</h2>
          <p className="section-subtitle">Browser localStorage remains a dev-only fallback and is not moderation or publish authority.</p>
          {drafts.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 12 }}>No local fallback drafts.</div>
          ) : (
            <div className="draft-list" style={{ marginTop: 12 }}>
              {drafts.map((draft) => <DraftListItem key={draft.id} draft={draft} />)}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function DraftListItem({ draft }: { draft: CampaignDraft }) {
  const readiness = buildDraftReadiness(draft);
  return (
    <article className="draft-item">
      <div className="split-row">
        <div>
          <strong>{draft.title || "Untitled campaign"}</strong>
          <div className="small muted">{draft.shortDescription || "No summary yet."}</div>
        </div>
        <span className={`badge ${readiness.readiness === "contract-ready" ? "badge-success" : "badge-warning"}`}>
          {readiness.readiness}
        </span>
      </div>
    </article>
  );
}
