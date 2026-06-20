"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";

import AlphaNavigation from "@/components/AlphaNavigation";
import ConnectWallet from "@/components/ConnectWallet";
import SetupBanner from "@/components/SetupBanner";
import WalletBar from "@/components/WalletBar";
import {
  BackendClientError,
  getBackendDiagnostics,
  getBackendHealth,
  getBackendUrl,
  listBackendAudit,
  listBackendSubmissions,
  moderateBackendSubmission,
  type BackendAuditEntry,
  type BackendDiagnostics,
  type BackendHealthStatus,
  type BackendModerationDecision,
  type BackendSubmission,
} from "@/lib/backendClient";

type QueueFilter = BackendSubmission["status"] | "all" | "actionable";
type AuditFilter = "all" | "review" | "publish" | "submission" | "updates" | "auth";

const QUEUE_STATUSES: BackendSubmission["status"][] = [
  "pending_review",
  "needs_changes",
  "approved",
  "published",
  "draft",
  "rejected",
];

function short(value?: string | null) {
  if (!value) return "-";
  return value.length <= 14 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function statusLabel(value: string) {
  return value.split("_").join(" ");
}

function statusBadge(status: BackendSubmission["status"]) {
  if (status === "approved" || status === "published") return "badge-success";
  if (status === "pending_review" || status === "needs_changes") return "badge-warning";
  return "badge-muted";
}

function errorMessage(error: unknown) {
  return error instanceof BackendClientError ? error.message : "Unexpected backend request failure.";
}

function detailString(entry: BackendAuditEntry, key: string) {
  const value = entry.detail[key];
  return typeof value === "string" ? value : null;
}

function auditSubmissionId(entry: BackendAuditEntry) {
  return detailString(entry, "submissionId");
}

function auditMatchesFilter(entry: BackendAuditEntry, filter: AuditFilter) {
  if (filter === "all") return true;
  if (filter === "review") return ["submission.approved", "submission.rejected", "submission.needs_changes"].includes(entry.action);
  if (filter === "publish") return entry.action === "submission.published";
  if (filter === "submission") return entry.action === "submission.created" || entry.action === "submission.updated" || entry.action === "submission.pending_review";
  if (filter === "updates") return entry.action === "campaign.update_added";
  return entry.action.startsWith("auth.");
}

function queueNextStep(submission: BackendSubmission) {
  if (submission.status === "pending_review") return "Review metadata, milestones, media references, creator wallet, and verification notes before deciding.";
  if (submission.status === "needs_changes") return "Waiting on creator revision. Use the history below to confirm the requested change before resubmission.";
  if (submission.status === "approved") return "Creator wallet must publish on-chain; admin should watch for the backend publish record.";
  if (submission.status === "published") return "Publish record is complete. Public trust signals should now come from backend and contract reads.";
  if (submission.status === "rejected") return "Terminal moderation state. Creator should start a new corrected submission if needed.";
  return submission.readiness.state === "contract-ready"
    ? "Draft is contract-ready but not submitted. Creator must submit it for review."
    : "Draft is incomplete; creator must resolve readiness blockers before review.";
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const backendUrl = getBackendUrl();
  const [submissions, setSubmissions] = useState<BackendSubmission[]>([]);
  const [auditLog, setAuditLog] = useState<BackendAuditEntry[]>([]);
  const [health, setHealth] = useState<BackendHealthStatus | null>(null);
  const [diagnostics, setDiagnostics] = useState<BackendDiagnostics | null>(null);
  const [diagnosticsMessage, setDiagnosticsMessage] = useState<string | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [verificationNotes, setVerificationNotes] = useState<Record<string, string>>({});
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("actionable");
  const [auditFilter, setAuditFilter] = useState<AuditFilter>("all");
  const [auditSubmissionFilter, setAuditSubmissionFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!backendUrl) return;
    setLoading(true);
    setError(null);
    try {
      const [nextSubmissions, nextAudit, nextHealth] = await Promise.all([
        listBackendSubmissions(),
        listBackendAudit(),
        getBackendHealth(),
      ]);
      setSubmissions(nextSubmissions);
      setAuditLog(nextAudit);
      setHealth(nextHealth);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const queueCounts = useMemo(() => {
    const counts: Record<BackendSubmission["status"], number> = {
      draft: 0,
      pending_review: 0,
      needs_changes: 0,
      approved: 0,
      rejected: 0,
      published: 0,
    };
    for (const submission of submissions) counts[submission.status] += 1;
    return counts;
  }, [submissions]);

  const visibleSubmissions = useMemo(() => {
    return [...submissions]
      .filter((submission) => {
        if (queueFilter === "all") return true;
        if (queueFilter === "actionable") return ["pending_review", "approved", "needs_changes"].includes(submission.status);
        return submission.status === queueFilter;
      })
      .sort((left, right) => {
        const leftRank = QUEUE_STATUSES.indexOf(left.status);
        const rightRank = QUEUE_STATUSES.indexOf(right.status);
        if (leftRank !== rightRank) return leftRank - rightRank;
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      });
  }, [queueFilter, submissions]);

  const visibleAudit = useMemo(() => {
    return auditLog.filter((entry) => {
      if (!auditMatchesFilter(entry, auditFilter)) return false;
      if (auditSubmissionFilter === "all") return true;
      return auditSubmissionId(entry) === auditSubmissionFilter;
    });
  }, [auditFilter, auditLog, auditSubmissionFilter]);

  const approvedUnpublished = queueCounts.approved;
  const pendingReviews = queueCounts.pending_review;
  const needsChanges = queueCounts.needs_changes;

  const loadDiagnostics = async () => {
    if (!backendUrl) return;
    setDiagnosticsLoading(true);
    setDiagnosticsMessage(null);
    setError(null);
    try {
      const payload = await getBackendDiagnostics(adminToken.trim());
      setDiagnostics(payload.diagnostics);
      setDiagnosticsMessage(payload.admin.alphaBypass ? payload.admin.note ?? "Admin diagnostics loaded through local alpha bypass." : "Admin diagnostics loaded.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setDiagnosticsLoading(false);
    }
  };

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
      setMessage(`${submission.title || "Submission"} marked ${statusLabel(decision)}.`);
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
          Admin operations use backend submissions and audit events as launch truth. Browser state only holds the temporary admin token and unsent form text.
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
            <span className="small muted">Held in this page state only and sent as x-admin-token. Production launch must set ADMIN_TOKEN.</span>
          </label>
          {message && <div className="panel-success" style={{ marginTop: 14 }}>{message}</div>}
          {error && <div className="panel-danger" style={{ marginTop: 14 }}>{error}</div>}
        </section>

        <section className="panel">
          <div className="split-row">
            <div>
              <h2>Backend health</h2>
              <p className="section-subtitle">Health and diagnostics make common launch failures visible without reading server logs.</p>
            </div>
            <button type="button" className="button-secondary" onClick={() => void loadDiagnostics()} disabled={!backendUrl || diagnosticsLoading}>
              {diagnosticsLoading ? "Loading diagnostics..." : "Load admin diagnostics"}
            </button>
          </div>
          {health ? (
            <>
              <div className="detail-grid">
                <div className="detail-item"><strong>Status</strong>{health.status}</div>
                <div className="detail-item"><strong>Production ready</strong>{health.productionReady ? "yes" : "no"}</div>
                <div className="detail-item"><strong>Started</strong>{formatTime(health.startedAt)}</div>
                <div className="detail-item"><strong>Uptime</strong>{health.uptimeSeconds}s</div>
                <div className="detail-item"><strong>Storage</strong>{health.config.storage}</div>
                <div className="detail-item"><strong>Admin token</strong>{health.config.adminTokenConfigured ? "configured" : "not configured"}</div>
              </div>
              {health.warnings.length > 0 && (
                <div className="panel-warning" style={{ marginTop: 12 }}>
                  <strong>Environment warnings</strong>
                  <ul style={{ marginBottom: 0 }}>
                    {health.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state" style={{ marginTop: 14 }}>Backend health has not loaded yet.</div>
          )}
          {diagnosticsMessage && <div className="panel-success" style={{ marginTop: 14 }}>{diagnosticsMessage}</div>}
          {diagnostics && (
            <div style={{ marginTop: 14 }}>
              <div className="detail-grid">
                <div className="detail-item"><strong>Audit events</strong>{diagnostics.counts.auditEvents}</div>
                <div className="detail-item"><strong>Auth nonces</strong>{diagnostics.counts.authNonces}</div>
                <div className="detail-item"><strong>Pending review</strong>{diagnostics.counts.submissions.pending_review}</div>
                <div className="detail-item"><strong>Approved unpublished</strong>{diagnostics.counts.submissions.approved}</div>
              </div>
              <div className="timeline" style={{ marginTop: 12 }}>
                <h3>Recent diagnostic audit events</h3>
                {diagnostics.recentAudit.slice(0, 5).map((entry) => (
                  <div className="timeline-item" key={entry.id}>
                    <div>
                      <strong>{entry.action}</strong>
                      <div className="small muted">{auditSubmissionId(entry) ? `Submission ${short(auditSubmissionId(entry))}` : "No submission reference"}</div>
                    </div>
                    <span className="small muted">{formatTime(entry.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="split-row">
            <div>
              <h2>Operations snapshot</h2>
              <p className="section-subtitle">Queue counts are loaded from the backend submission store and grouped by launch state.</p>
            </div>
            <span className={`badge ${pendingReviews > 0 || approvedUnpublished > 0 ? "badge-warning" : "badge-success"}`}>
              {pendingReviews + approvedUnpublished} launch action{pendingReviews + approvedUnpublished === 1 ? "" : "s"}
            </span>
          </div>
          <div className="stats-grid" style={{ marginTop: 14 }}>
            {QUEUE_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className="campaign-list-button"
                onClick={() => setQueueFilter(status)}
              >
                <span className={`badge ${statusBadge(status)}`}>{statusLabel(status)}</span>
                <span className="stat-value">{queueCounts[status]}</span>
              </button>
            ))}
          </div>
          <div className="trust-grid" style={{ marginTop: 14 }}>
            <div className="trust-note">
              <strong>Pending reviews</strong>
              <span>{pendingReviews} submission{pendingReviews === 1 ? "" : "s"} need admin moderation and manual verification decisions.</span>
            </div>
            <div className="trust-note">
              <strong>Needs changes</strong>
              <span>{needsChanges} submission{needsChanges === 1 ? "" : "s"} are waiting for creator revision. Check history before resubmission.</span>
            </div>
            <div className="trust-note">
              <strong>Approved unpublished</strong>
              <span>{approvedUnpublished} approved submission{approvedUnpublished === 1 ? "" : "s"} still require creator wallet publishing.</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="split-row">
            <div>
              <h2>Backend review queue</h2>
              <p className="section-subtitle">
                Showing {visibleSubmissions.length} of {submissions.length} backend submission{submissions.length === 1 ? "" : "s"}. Actions are available for pending review records.
              </p>
            </div>
            <label className="form-field" style={{ minWidth: 220 }}>
              Queue state
              <select value={queueFilter} onChange={(event) => setQueueFilter(event.target.value as QueueFilter)}>
                <option value="actionable">Launch actions</option>
                <option value="all">All states</option>
                {QUEUE_STATUSES.map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
            </label>
          </div>

          {submissions.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 14 }}>
              <strong>No backend submissions found.</strong>
              <p>Creator submissions saved through the New draft page will appear here.</p>
            </div>
          ) : visibleSubmissions.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 14 }}>No submissions match the current queue filter.</div>
          ) : (
            <div className="draft-list" style={{ marginTop: 14 }}>
              {visibleSubmissions.map((submission) => {
                const actionable = submission.status === "pending_review" && isConnected && busyId === null;
                const manuallyVerified = verified[submission.id] === true;
                const history = auditLog.filter((entry) => auditSubmissionId(entry) === submission.id);
                const needsChangesHistory = history.filter((entry) => entry.action === "submission.needs_changes");
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
                        <span className={`badge ${statusBadge(submission.status)}`}>{statusLabel(submission.status)}</span>
                        <span className={`badge ${submission.verification?.state === "manually_verified" ? "badge-success" : "badge-muted"}`}>
                          {statusLabel(submission.verification?.state ?? "unverified")}
                        </span>
                      </div>
                    </div>

                    <div className="trust-grid" style={{ marginTop: 12 }}>
                      <div className="trust-note">
                        <strong>Admin next action</strong>
                        <span>{queueNextStep(submission)}</span>
                      </div>
                      <div className="trust-note">
                        <strong>Verification decision</strong>
                        <span>{submission.verification?.state === "manually_verified" ? "Manual creator and submission checks recorded." : "Not manually verified. Approval stays blocked until the reviewer records manual verification."}</span>
                      </div>
                      <div className="trust-note">
                        <strong>Audit coverage</strong>
                        <span>{history.length} backend audit event{history.length === 1 ? "" : "s"} reference this submission.</span>
                      </div>
                    </div>

                    <div className="detail-grid">
                      <div className="detail-item"><strong>Creator</strong>{short(submission.creatorAddress)}</div>
                      <div className="detail-item"><strong>Metadata</strong>{submission.metadataURI || "not set"}</div>
                      <div className="detail-item"><strong>Review</strong>{submission.review?.decision ? statusLabel(submission.review.decision) : "not reviewed"}</div>
                      <div className="detail-item"><strong>Reviewer</strong>{short(submission.review?.reviewerAddress)}</div>
                      <div className="detail-item"><strong>Updated</strong>{formatTime(submission.updatedAt)}</div>
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

                    {(submission.review?.note || submission.verification?.note) && (
                      <div className="trust-grid" style={{ marginTop: 12 }}>
                        {submission.review?.note && (
                          <div className="trust-note">
                            <strong>Last review note</strong>
                            <span>{submission.review.note}</span>
                          </div>
                        )}
                        {submission.verification?.note && (
                          <div className="trust-note">
                            <strong>Verification note</strong>
                            <span>{submission.verification.note}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {needsChangesHistory.length > 0 && (
                      <div className="timeline" style={{ marginTop: 14 }}>
                        <h3>Needs-changes history</h3>
                        {needsChangesHistory.map((entry) => (
                          <div className="timeline-item" key={entry.id}>
                            <div>
                              <strong>{statusLabel(detailString(entry, "reviewDecision") ?? "needs_changes")}</strong>
                              <div className="small muted">Previous state: {statusLabel(detailString(entry, "previousStatus") ?? "unknown")}</div>
                              <div className="small muted">Reviewer: {short(detailString(entry, "reviewerAddress"))}</div>
                            </div>
                            <span className="small muted">{formatTime(entry.timestamp)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {submission.publish && (
                      <div className="panel-success" style={{ marginTop: 12 }}>
                        <strong>Backend publish record</strong>
                        <div className="detail-grid">
                          <div className="detail-item"><strong>Campaign</strong>{short(submission.publish.campaignAddress)}</div>
                          <div className="detail-item"><strong>Transaction</strong>{short(submission.publish.transactionHash)}</div>
                          <div className="detail-item"><strong>Factory</strong>{short(submission.publish.factoryAddress)}</div>
                          <div className="detail-item"><strong>Chain</strong>{submission.publish.chainId}</div>
                          <div className="detail-item"><strong>Publisher</strong>{short(submission.publish.publisherAddress)}</div>
                          <div className="detail-item"><strong>Published</strong>{formatTime(submission.publish.publishedAt)}</div>
                        </div>
                      </div>
                    )}

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
          <div className="split-row">
            <div>
              <h2>Backend audit log</h2>
              <p className="section-subtitle">Submission saves, state changes, review decisions, publish records, auth, and update events are listed newest first.</p>
            </div>
            <div className="form-grid" style={{ minWidth: 320 }}>
              <label className="form-field">
                Event type
                <select value={auditFilter} onChange={(event) => setAuditFilter(event.target.value as AuditFilter)}>
                  <option value="all">All events</option>
                  <option value="review">Review decisions</option>
                  <option value="publish">Publish records</option>
                  <option value="submission">Submission lifecycle</option>
                  <option value="updates">Campaign updates</option>
                  <option value="auth">Auth events</option>
                </select>
              </label>
              <label className="form-field">
                Submission
                <select value={auditSubmissionFilter} onChange={(event) => setAuditSubmissionFilter(event.target.value)}>
                  <option value="all">All submissions</option>
                  {submissions.map((submission) => (
                    <option key={submission.id} value={submission.id}>{submission.title || short(submission.id)}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 10 }}>
            Showing {visibleAudit.length} of {auditLog.length} audit event{auditLog.length === 1 ? "" : "s"}.
          </p>
          {auditLog.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 12 }}>No backend audit events found.</div>
          ) : visibleAudit.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 12 }}>No audit events match the current filters.</div>
          ) : (
            <div className="audit-list" style={{ marginTop: 12 }}>
              {visibleAudit.map((entry) => (
                <div key={entry.id} className="draft-item">
                  <div className="split-row">
                    <strong>{entry.action}</strong>
                    <span className="small muted">{formatTime(entry.timestamp)}</span>
                  </div>
                  {auditSubmissionId(entry) && <div className="small muted" style={{ marginTop: 6 }}>Submission: {short(auditSubmissionId(entry))}</div>}
                  <pre className="local-json" style={{ marginTop: 8 }}>{JSON.stringify(entry.detail, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
