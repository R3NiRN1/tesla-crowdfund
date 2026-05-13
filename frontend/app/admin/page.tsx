"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AlphaNavigation from "@/components/AlphaNavigation";
import ConnectWallet from "@/components/ConnectWallet";
import SetupBanner from "@/components/SetupBanner";
import TestnetPublishDraft from "@/components/TestnetPublishDraft";
import WalletBar from "@/components/WalletBar";
import {
  appendAuditLog,
  getAuditLog,
  getCampaignDrafts,
  updateCampaignDraftAdminNote,
  updateCampaignDraftReview,
  type AuditLogEntry,
  type CampaignDraft,
  type CampaignDraftReviewAction,
  type CampaignDraftReviewState,
} from "@/lib/localCampaigns";
import { ZERO_ADDRESS } from "@/lib/publicConfig";
import { usePublicConfig } from "@/lib/usePublicConfig";

const LOCAL_REVIEW_NOTICE =
  "local-only, not authenticated, not production moderation, stored in browser localStorage";
const TESTNET_PUBLISH_NOTICE =
  "wallet-driven testnet alpha path, local record only, not backend verified, not production moderation";

function short(value: string | null | undefined) {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function createLogEntry(action: string, detail?: string): AuditLogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    detail,
    timestamp: new Date().toISOString(),
  };
}

function getNoteMap(drafts: CampaignDraft[]): Record<string, string> {
  return Object.fromEntries(drafts.map((draft) => [draft.id, draft.adminNote ?? ""]));
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "not ready";
  const days = seconds / 86400;
  return Number.isInteger(days) ? `${days} day${days === 1 ? "" : "s"}` : `${seconds} seconds`;
}

function reviewBadgeClass(reviewState: CampaignDraftReviewState) {
  if (reviewState === "locally approved") return "badge-success";
  if (reviewState === "needs changes") return "badge-warning";
  if (reviewState === "rejected locally") return "badge-muted";
  return "badge-muted";
}

export default function AdminPage() {
  const publicConfig = usePublicConfig();
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [notesByDraftId, setNotesByDraftId] = useState<Record<string, string>>({});

  useEffect(() => {
    const storedDrafts = getCampaignDrafts();
    setDrafts(storedDrafts);
    setAuditLog(getAuditLog());
    setNotesByDraftId(getNoteMap(storedDrafts));
  }, []);

  const hasRpc = !!publicConfig.rpcUrl;
  const hasChainId = publicConfig.chainId !== null;
  const hasFactory = publicConfig.factoryAddress !== ZERO_ADDRESS;
  const hasToken = publicConfig.tokenAddress !== ZERO_ADDRESS;

  const configSummary = useMemo(
    () => ({
      mode: publicConfig.isConfigured
        ? publicConfig.chainId === 97
          ? "configured testnet"
          : "configured network"
        : "setup/read-only",
      chainId: publicConfig.chainId ?? "not set",
      rpc: publicConfig.rpcUrl ? "configured" : "missing",
      factory: hasFactory ? short(publicConfig.factoryAddress) : "not configured",
      token: hasToken ? short(publicConfig.tokenAddress) : "not configured",
    }),
    [hasFactory, hasToken, publicConfig]
  );

  const exportableDrafts = drafts.filter(
    (draft) => draft.reviewState === "locally approved" && draft.readiness === "contract-ready"
  );

  const setDraftNote = (id: string, note: string) => {
    setNotesByDraftId((prev) => ({
      ...prev,
      [id]: note,
    }));
  };

  const syncDraftState = (nextDrafts: CampaignDraft[], nextAuditLog: AuditLogEntry[]) => {
    setDrafts(nextDrafts);
    setAuditLog(nextAuditLog);
    setNotesByDraftId(getNoteMap(nextDrafts));
  };

  const saveNote = (draft: CampaignDraft) => {
    const result = updateCampaignDraftAdminNote(draft.id, notesByDraftId[draft.id] ?? "");
    syncDraftState(result.drafts, result.auditLog);
  };

  const reviewDraft = (
    draft: CampaignDraft,
    reviewState: CampaignDraftReviewState,
    action: CampaignDraftReviewAction
  ) => {
    const result = updateCampaignDraftReview(draft.id, reviewState, action, notesByDraftId[draft.id] ?? "");
    syncDraftState(result.drafts, result.auditLog);
  };

  const exportApprovedDrafts = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      localOnly: true,
      note: `Local admin review export: ${LOCAL_REVIEW_NOTICE}. This does not publish, deploy, upload, or submit drafts.`,
      drafts: exportableDrafts.map((draft) => ({
        id: draft.id,
        title: draft.title,
        readiness: draft.readiness,
        contractInput: draft.contractInput,
        reviewState: draft.reviewState ?? "draft",
        adminNote: draft.adminNote ?? "",
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tesla-crowdfund-approved-local-drafts.json";
    anchor.click();
    URL.revokeObjectURL(url);

    const entry = createLogEntry(
      "export approved contract-ready drafts",
      `Exported ${exportableDrafts.length} locally approved, contract-ready draft(s).`
    );
    setAuditLog(appendAuditLog(entry));
  };

  return (
    <main className="alpha-shell">
      <div className="alpha-container">
        <header className="alpha-header">
          <div>
            <p className="eyebrow">Local-only admin review</p>
            <h1>Local admin review</h1>
            <p>
              This scaffold is {LOCAL_REVIEW_NOTICE}. Review data stays browser-local; the separate testnet publish path
              below only runs after a user click and wallet confirmation.
            </p>
          </div>
          <div className="alpha-actions">
            <WalletBar />
            <ConnectWallet />
            <Link className="button-link" href="/">
              Dashboard
            </Link>
          </div>
        </header>

        <AlphaNavigation active="admin" />
        <SetupBanner />

        <div className="panel-warning">
          Review states, admin notes, export history, and audit entries are {LOCAL_REVIEW_NOTICE}. This is not production
          moderation and it does not add backend storage, authentication, uploads, or mainnet publishing.
        </div>

        <div className="panel-warning">
          Testnet publish is a {TESTNET_PUBLISH_NOTICE}. It calls the configured BSC testnet factory only after the user
          clicks Publish to testnet and confirms in their connected wallet.
        </div>

        <section className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Mode</span>
            <span className="stat-value">{configSummary.mode}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Chain ID</span>
            <span className="stat-value">{configSummary.chainId}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">RPC</span>
            <span className="stat-value">{configSummary.rpc}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Factory</span>
            <span className="stat-value">{configSummary.factory}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Token</span>
            <span className="stat-value">{configSummary.token}</span>
          </div>
        </section>

        {!hasChainId && (
          <div className="panel-danger">Chain ID is missing. Contract writes remain disabled until setup is complete.</div>
        )}
        {hasRpc && !publicConfig.isConfigured && (
          <div className="panel-warning">
            RPC is present, but factory or token settings are missing. The app remains in setup/read-only mode.
          </div>
        )}

        <section className="panel">
          <div className="split-row">
            <div>
              <h2>Review queue</h2>
              <p className="section-subtitle">
                Local draft review is {LOCAL_REVIEW_NOTICE}. Only locally approved, contract-ready drafts can be
                exported from this admin scaffold.
              </p>
            </div>
            <div className="button-row">
              <Link className="button-primary" href="/campaigns/new">
                Create draft
              </Link>
              <button
                type="button"
                onClick={exportApprovedDrafts}
                disabled={exportableDrafts.length === 0}
                className={exportableDrafts.length === 0 ? "button-disabled" : "button-secondary"}
              >
                Export approved contract-ready
              </button>
            </div>
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>
            Exportable drafts: {exportableDrafts.length}. Export payloads include exportedAt, contractInput,
            reviewState, and adminNote.
          </div>
        </section>

        <section className="panel">
          <h2>Local drafts</h2>
          {drafts.length === 0 ? (
            <div className="empty-state">
              <strong>No local drafts found.</strong>
              <p>Drafts created from the New draft page will appear here as browser localStorage records.</p>
            </div>
          ) : (
            <div className="draft-list">
              {drafts.map((draft) => {
                const isContractReady = draft.readiness === "contract-ready";
                const firstBlocker = draft.readinessReasons[0] ?? "none";
                return (
                  <article key={draft.id} className="draft-item">
                    <div className="split-row">
                      <div>
                        <strong>{draft.title || "Untitled campaign"}</strong>
                        <div className="small muted">{draft.shortDescription || "No summary yet."}</div>
                      </div>
                      <div className="button-row">
                        <span className={`badge ${isContractReady ? "badge-success" : "badge-warning"}`}>
                          {isContractReady ? "contract-ready" : "incomplete"}
                        </span>
                        <span className={`badge ${reviewBadgeClass(draft.reviewState ?? "draft")}`}>
                          {draft.reviewState ?? "draft"}
                        </span>
                      </div>
                    </div>

                    <div className="stats-grid" style={{ marginTop: 12 }}>
                      <div className="stat-card">
                        <span className="stat-label">Goal</span>
                        <span className="stat-value">{draft.goalAmount || "not set"}</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-label">Milestone total</span>
                        <span className="stat-value">{draft.milestoneTotal || "0"}</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-label">Duration</span>
                        <span className="stat-value">{formatDuration(draft.durationSeconds)}</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-label">First blocker</span>
                        <span className="stat-value">{isContractReady ? "none" : firstBlocker}</span>
                      </div>
                    </div>

                    <label className="form-field" style={{ marginTop: 12 }}>
                      Admin note
                      <textarea
                        value={notesByDraftId[draft.id] ?? ""}
                        onChange={(event) => setDraftNote(draft.id, event.target.value)}
                        rows={3}
                        placeholder="Optional local admin note for this browser-only draft"
                      />
                    </label>

                    <div className="button-row" style={{ marginTop: 12 }}>
                      <button type="button" onClick={() => saveNote(draft)} className="button-secondary">
                        Save note
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewDraft(draft, "needs changes", "mark needs changes")}
                        className="button-secondary"
                      >
                        Mark needs changes
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewDraft(draft, "locally approved", "approve locally")}
                        disabled={!isContractReady}
                        className={isContractReady ? "button-primary" : "button-disabled"}
                      >
                        Approve locally
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewDraft(draft, "rejected locally", "reject locally")}
                        className="button-secondary"
                      >
                        Reject locally
                      </button>
                      <button
                        type="button"
                        onClick={() => reviewDraft(draft, "draft", "reset to draft")}
                        className="button-secondary"
                      >
                        Reset to draft
                      </button>
                    </div>

                    <div className="small muted" style={{ marginTop: 10 }}>
                      Review actions update this browser localStorage and audit log only. They are {LOCAL_REVIEW_NOTICE}.
                    </div>

                    <TestnetPublishDraft
                      draft={draft}
                      onPublished={(result) => syncDraftState(result.drafts, result.auditLog)}
                    />
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Local audit log</h2>
          <p className="section-subtitle">
            Audit entries are {LOCAL_REVIEW_NOTICE}. Review action entries include timestamp, action, draft id, draft
            title, and note when present.
          </p>
          {auditLog.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 12 }}>
              No local audit events yet.
            </div>
          ) : (
            <div className="audit-list" style={{ marginTop: 12 }}>
              {auditLog.map((entry) => (
                <div key={entry.id} className="draft-item">
                  <strong>{entry.action}</strong>
                  {entry.draftTitle && (
                    <div className="small muted">
                      Draft: {entry.draftTitle} ({entry.draftId})
                    </div>
                  )}
                  {entry.note && <div className="small muted">Note: {entry.note}</div>}
                  {entry.detail && <div className="small muted">{entry.detail}</div>}
                  <div className="small muted">{new Date(entry.timestamp).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
