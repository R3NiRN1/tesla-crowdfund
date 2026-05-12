"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import AlphaNavigation from "@/components/AlphaNavigation";
import SetupBanner from "@/components/SetupBanner";
import { ZERO_ADDRESS } from "@/lib/publicConfig";
import { usePublicConfig } from "@/lib/usePublicConfig";
import {
  appendAuditLog,
  getAuditLog,
  getCampaignDrafts,
  type AuditLogEntry,
  type CampaignDraft,
} from "@/lib/localCampaigns";

function short(value: string | null | undefined) {
  if (!value) return "—";
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

export default function AdminPage() {
  const publicConfig = usePublicConfig();
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    setDrafts(getCampaignDrafts());
    setAuditLog(getAuditLog());
    const entry = createLogEntry("opened admin scaffold", "Visited /admin local dashboard");
    setAuditLog(appendAuditLog(entry));
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

  const exportDrafts = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      note: "Local-only TES Crowdfund alpha scaffold export. Not on-chain.",
      drafts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tesla-crowdfund-drafts.json";
    anchor.click();
    URL.revokeObjectURL(url);

    const entry = createLogEntry("exported local drafts", `Exported ${drafts.length} drafts`);
    setAuditLog(appendAuditLog(entry));
  };

  return (
    <main className="alpha-shell">
      <div className="alpha-container">
        <header className="alpha-header">
          <div>
            <p className="eyebrow">Local scaffold</p>
            <h1>Admin scaffold</h1>
            <p>Browser-only admin surface for alpha demos. No authentication, backend, or server storage is enabled.</p>
          </div>
          <Link className="button-link" href="/">
            Deployed campaigns
          </Link>
        </header>

        <AlphaNavigation active="admin" />
        <SetupBanner />

        <div className="panel-warning">
          Admin, audit log, and draft data are local-only scaffold features. They do not deploy campaigns, write to a
          backend, or change contracts.
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
              <h2>Draft actions</h2>
              <p className="section-subtitle">Create or export local campaign drafts for alpha review.</p>
            </div>
            <div className="button-row">
              <Link className="button-primary" href="/campaigns/new">
                Create draft
              </Link>
              <button
                type="button"
                onClick={exportDrafts}
                disabled={drafts.length === 0}
                className={drafts.length === 0 ? "button-disabled" : "button-secondary"}
              >
                Export drafts
              </button>
            </div>
          </div>
          {drafts.length === 0 && (
            <div className="empty-state" style={{ marginTop: 14 }}>
              <strong>No local drafts available.</strong>
              <p>The export action enables once at least one browser draft exists.</p>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Campaign drafts</h2>
          {drafts.length === 0 ? (
            <div className="empty-state">
              <strong>No drafts found.</strong>
              <p>Drafts created from the New draft page will appear here as local scaffold records.</p>
            </div>
          ) : (
            <div className="draft-list">
              {drafts.map((draft) => (
                <article key={draft.id} className="draft-item">
                  <div className="split-row">
                    <div>
                      <strong>{draft.title}</strong>
                      <div className="small muted">{draft.shortDescription || "No summary yet."}</div>
                    </div>
                    <span className={`badge ${draft.status === "published" ? "badge-success" : "badge-muted"}`}>
                      local {draft.status}
                    </span>
                  </div>
                  <div className="small muted" style={{ marginTop: 8 }}>
                    Goal: {draft.goalAmount || "not set"} | Beneficiary: {draft.beneficiaryAddress || "not set"}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Local audit log</h2>
          {auditLog.length === 0 ? (
            <div className="empty-state">No local audit events yet.</div>
          ) : (
            <div className="audit-list">
              {auditLog.map((entry) => (
                <div key={entry.id} className="draft-item">
                  <strong>{entry.action}</strong>
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
