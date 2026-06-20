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

function statusLabel(status: BackendSubmission["status"]) {
  return status.replace("_", " ");
}

function statusBadgeClass(status: BackendSubmission["status"]) {
  if (status === "approved" || status === "published") return "badge-success";
  if (status === "pending_review" || status === "needs_changes") return "badge-warning";
  if (status === "rejected") return "badge-warning";
  return "badge-muted";
}

function creatorNextStep(submission: BackendSubmission) {
  if (submission.status === "published") {
    return "Published. The backend has recorded the wallet transaction and public campaign address.";
  }
  if (submission.status === "approved") {
    return "Approved. Connect the approved creator wallet, confirm network and factory settings, then publish below.";
  }
  if (submission.status === "pending_review") {
    return "Pending review. Wait for an admin decision; edits are locked until the reviewer requests changes.";
  }
  if (submission.status === "needs_changes") {
    return "Needs changes. Use the reviewer note, revise in the builder, save to backend, then submit again. If the form session is gone, start a corrected backend draft.";
  }
  if (submission.status === "rejected") {
    return "Rejected. This record is terminal; start a new backend draft if the campaign should be resubmitted.";
  }
  if (submission.readiness.state !== "contract-ready") {
    return "Draft incomplete. Fix readiness blockers in New draft, save to backend again, then submit for review.";
  }
  return "Draft ready. Submit it for review from New draft when metadata and media references are final.";
}

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
            <p>Track backend review state, resolve requested changes, and publish approved campaigns through the matching creator wallet.</p>
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
              <p className="section-subtitle">Each record shows the current backend state and the next creator action.</p>
            </div>
            <button type="button" className="button-secondary" onClick={() => void refresh()} disabled={!backendUrl}>Refresh</button>
          </div>

          {isConnected && creatorSubmissions.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 14 }}>
              <strong>No backend submissions found for this wallet.</strong>
              <p>Create a draft, save it to the backend, resolve readiness blockers, then submit for review.</p>
            </div>
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
                      <span className={`badge ${statusBadgeClass(submission.status)}`}>
                        {statusLabel(submission.status)}
                      </span>
                    </div>
                  </div>

                  <div className="panel-warning" style={{ marginTop: 12 }}>
                    <strong>Next step</strong>
                    <div style={{ marginTop: 4 }}>{creatorNextStep(submission)}</div>
                  </div>

                  <div className="detail-grid">
                    <div className="detail-item"><strong>Metadata URI</strong>{submission.metadataURI || "not set"}</div>
                    <div className="detail-item"><strong>Readiness checked</strong>{new Date(submission.readiness.checkedAt).toLocaleString()}</div>
                    <div className="detail-item"><strong>Review outcome</strong>{submission.review?.decision ? statusLabel(submission.review.decision) : "not reviewed"}</div>
                    <div className="detail-item"><strong>Publish record</strong>{submission.publish ? `tx ${submission.publish.transactionHash.slice(0, 10)}...` : "not published"}</div>
                  </div>

                  {submission.readiness.reasons.length > 0 && (
                    <div className="panel-warning" style={{ marginTop: 12 }}>
                      <strong>Readiness blockers</strong>
                      <ul style={{ marginBottom: 0 }}>
                        {submission.readiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                      </ul>
                    </div>
                  )}

                  {submission.review?.note && (
                    <div className="panel-warning" style={{ marginTop: 12 }}>
                      <strong>Reviewer note</strong>
                      <div style={{ marginTop: 4 }}>{submission.review.note}</div>
                    </div>
                  )}

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
