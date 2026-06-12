"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

import AlphaNavigation from "@/components/AlphaNavigation";
import ConnectWallet from "@/components/ConnectWallet";
import SetupBanner from "@/components/SetupBanner";
import WalletBar from "@/components/WalletBar";
import {
  BackendClientError,
  getBackendUrl,
  listBackendAudit,
  listBackendSubmissions,
  moderateBackendSubmission,
  type BackendAuditEntry,
  type BackendModerationDecision,
  type BackendSubmission,
} from "@/lib/backendClient";

function short(value?: string | null) {
  if (!value) return "-";
  return value.length <= 14 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function statusBadge(status: BackendSubmission["status"]) {
  if (status === "approved" || status === "published") return "badge-success";
  if (status === "pending_review" || status === "needs_changes") return "badge-warning";
  return "badge-muted";
}

function errorMessage(error: unknown) {
  return error instanceof BackendClientError ? error.message : "Unexpected backend request failure.";
}

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const backendUrl = getBackendUrl();
  const [submissions, setSubmissions] = useState<BackendSubmission[]>([]);
  const [auditLog, setAuditLog] = useState<BackendAuditEntry[]>([]);
  const [adminToken, setAdminToken] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [verificationNotes, setVerificationNotes] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!backendUrl) return;
    setLoading(true);
    setError(null);
    try {
      const [nextSubmissions, nextAudit] = await Promise.all([
        listBackendSubmissions(),
        listBackendAudit(),
      ]);
      setSubmissions(nextSubmissions);
      setAuditLog(nextAudit);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const moderate = async (submission: BackendSubmission, decision: BackendModerationDecision) => {
    if (!address) return;
    setBusyId(submission.id);
    setMessage(null);
    setError(null);
    try {
      await moderateBackendSubmission(
        submission.id,
        {
          decision,
          note: notes[submission.id] ?? "",
          reviewerAddress: address,
          manuallyVerified: verified[submission.id] === true,
          verificationNote: verificationNotes[submission.id] ?? "",
        },
        adminToken.trim(),
      );
      setMessage(`${submission.title || "Submission"} marked ${decision.replace("_", " ")}.`);
      await refresh();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="alpha-shell">
      <div className="alpha-container">
        <header className="alpha-header">
          <div>
            <p className="eyebrow">Backend moderation</p>
            <h1>Admin review</h1>
            <p>Review backend submissions, record manual verification, and write moderation decisions to the audit log.</p>
          </div>
          <div className="alpha-actions">
            <WalletBar />
            <ConnectWallet />
            <Link className="button-link" href="/">Dashboard</Link>
          </div>
        </header>

        <AlphaNavigation active="admin" />
        <SetupBanner />

        {!backendUrl && (
          <div className="panel-warning">Set NEXT_PUBLIC_BACKEND_URL to enable backend moderation.</div>
        )}
        {backendUrl && !isConnected && (
          <div className="panel-warning">Connect the reviewer wallet before taking moderation actions.</div>
        )}
        <div className="panel-warning">
          Verification is manual for V1. No third-party KYC or automated identity claim is made.
        </div>

        <section className="panel">
          <div className="split-row">
            <div>
              <h2>Backend connection</h2>
              <p className="section-subtitle">{backendUrl || "Backend URL is not configured."}</p>
            </div>
            <button type="button" onClick={() => void refresh()} className="button-secondary" disabled={!backendUrl || loading}>
              {loading ? "Refreshing..." : "Refresh queue"}
            </button>
          </div>
          <label className="form-field" style={{ marginTop: 14 }}>
            Admin token
            <input
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="Optional when backend ADMIN_TOKEN is unset"
              autoComplete="off"
            />
            <span className="small muted">Held in this page state only and sent as x-admin-token.</span>
          </label>
          {message && <div className="panel-success" style={{ marginTop: 14 }}>{message}</div>}
          {error && <div className="panel-danger" style={{ marginTop: 14 }}>{error}</div>}
        </section>

        <section className="panel">
          <h2>Backend review queue</h2>
          <p className="section-subtitle">
            {submissions.length} submission{submissions.length === 1 ? "" : "s"}. Actions are available for pending review records.
          </p>
          {submissions.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 14 }}>
              <strong>No backend submissions found.</strong>
              <p>Creator submissions saved through the New draft page will appear here.</p>
            </div>
          ) : (
            <div className="draft-list" style={{ marginTop: 14 }}>
              {submissions.map((submission) => {
                const actionable = submission.status === "pending_review" && isConnected && busyId === null;
                const manuallyVerified = verified[submission.id] === true;
                return (
                  <article key={submission.id} className="draft-item">
                    <div className="split-row">
                      <div>
                        <strong>{submission.title || "Untitled campaign"}</strong>
                        <div className="small muted">{submission.shortDescription || "No summary."}</div>
                      </div>
                      <div className="button-row">
                        <span className={`badge ${submission.readiness.state === "contract-ready" ? "badge-success" : "badge-warning"}`}>
                          {submission.readiness.state}
                        </span>
                        <span className={`badge ${statusBadge(submission.status)}`}>{submission.status.replace("_", " ")}</span>
                        <span className={`badge ${submission.verification?.state === "manually_verified" ? "badge-success" : "badge-muted"}`}>
                          {submission.verification?.state?.replace("_", " ") ?? "unverified"}
                        </span>
                      </div>
                    </div>

                    <div className="detail-grid">
                      <div className="detail-item"><strong>Creator</strong>{short(submission.creatorAddress)}</div>
                      <div className="detail-item"><strong>Metadata</strong>{submission.metadataURI || "not set"}</div>
                      <div className="detail-item"><strong>Review</strong>{submission.review?.decision?.replace("_", " ") ?? "not reviewed"}</div>
                      <div className="detail-item"><strong>Publish</strong>{submission.publish ? short(submission.publish.transactionHash) : "not published"}</div>
                    </div>

                    {submission.readiness.reasons.length > 0 && (
                      <div className="panel-warning" style={{ marginTop: 12 }}>
                        <strong>Readiness blockers</strong>
                        <ul style={{ marginBottom: 0 }}>
                          {submission.readiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                        </ul>
                      </div>
                    )}

                    {submission.review?.note && <div className="small muted" style={{ marginTop: 10 }}>Last review note: {submission.review.note}</div>}

                    <div className="form-grid" style={{ marginTop: 14 }}>
                      <label className="form-field">
                        Moderation note
                        <textarea
                          rows={3}
                          value={notes[submission.id] ?? ""}
                          onChange={(event) => setNotes((current) => ({ ...current, [submission.id]: event.target.value }))}
                          placeholder="Explain approval, rejection, or requested changes"
                          disabled={!actionable}
                        />
                      </label>
                      <label className="form-field">
                        Verification note
                        <textarea
                          rows={3}
                          value={verificationNotes[submission.id] ?? ""}
                          onChange={(event) => setVerificationNotes((current) => ({ ...current, [submission.id]: event.target.value }))}
                          placeholder="Describe the manual checks performed"
                          disabled={!actionable}
                        />
                      </label>
                    </div>

                    <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                      <input
                        type="checkbox"
                        checked={manuallyVerified}
                        onChange={(event) => setVerified((current) => ({ ...current, [submission.id]: event.target.checked }))}
                        disabled={!actionable}
                      />
                      I manually verified the creator and submission details.
                    </label>

                    <div className="button-row" style={{ marginTop: 12 }}>
                      <button type="button" className="button-secondary" disabled={!actionable} onClick={() => void moderate(submission, "needs_changes")}>
                        Needs changes
                      </button>
                      <button type="button" className="button-secondary" disabled={!actionable} onClick={() => void moderate(submission, "rejected")}>
                        Reject
                      </button>
                      <button
                        type="button"
                        className={actionable && manuallyVerified ? "button-primary" : "button-disabled"}
                        disabled={!actionable || !manuallyVerified}
                        onClick={() => void moderate(submission, "approved")}
                      >
                        Approve verified
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Backend audit log</h2>
          <p className="section-subtitle">Submission saves, state changes, review decisions, and publish records are listed newest first.</p>
          {auditLog.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 12 }}>No backend audit events found.</div>
          ) : (
            <div className="audit-list" style={{ marginTop: 12 }}>
              {auditLog.map((entry) => (
                <div key={entry.id} className="draft-item">
                  <strong>{entry.action}</strong>
                  <pre className="local-json" style={{ marginTop: 8 }}>{JSON.stringify(entry.detail, null, 2)}</pre>
                  <div className="small muted" style={{ marginTop: 8 }}>{new Date(entry.timestamp).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
