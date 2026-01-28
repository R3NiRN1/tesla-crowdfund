"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import SetupBanner from "@/components/SetupBanner";
import {
  appendAuditLog,
  getAuditLog,
  getCampaignDrafts,
  markDraftPublished,
  type AuditLogEntry,
  type CampaignDraft,
} from "@/lib/localCampaigns";
import { getStoredConfig, type StoredConfig } from "@/lib/storedConfig";

const ADMIN_SESSION_KEY = "teslaCrowdfundAdminSession:v1";

function loadAdminSession(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(ADMIN_SESSION_KEY);
}

function saveAdminSession(token: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ADMIN_SESSION_KEY, token);
}

function clearAdminSession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
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
  const [storedConfig, setStoredConfig] = useState<StoredConfig | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [inputToken, setInputToken] = useState("");
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStoredConfig(getStoredConfig());
    setSessionToken(loadAdminSession());
    setDrafts(getCampaignDrafts());
    setAuditLog(getAuditLog());
  }, []);

  const adminToken = storedConfig?.adminToken ?? null;
  const isAuthed = adminToken && sessionToken === adminToken;

  const publishedDrafts = useMemo(() => drafts.filter((draft) => draft.status === "published"), [drafts]);

  const handleLogin = () => {
    if (!adminToken) {
      setError("No admin passphrase set. Complete setup first.");
      return;
    }
    if (inputToken.trim() !== adminToken) {
      setError("Incorrect passphrase.");
      return;
    }
    saveAdminSession(adminToken);
    setSessionToken(adminToken);
    setError(null);
  };

  const handleLogout = () => {
    clearAdminSession();
    setSessionToken(null);
  };

  const handlePublish = (id: string) => {
    const nextDrafts = markDraftPublished(id);
    setDrafts(nextDrafts);
    const entry = createLogEntry("publish", `Published draft ${id}`);
    setAuditLog(appendAuditLog(entry));
  };

  const exportPublished = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      config: storedConfig,
      publishedDrafts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tesla-crowdfund-published.json";
    anchor.click();
    URL.revokeObjectURL(url);

    const entry = createLogEntry("export", "Exported published campaigns");
    setAuditLog(appendAuditLog(entry));
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
          <p style={{ margin: "4px 0", color: "#4b5563" }}>Local admin tools (MVP security).</p>
        </div>
        <Link href="/">Back to explorer</Link>
      </header>

      <SetupBanner />

      {!adminToken && (
        <div
          style={{
            marginTop: 16,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #f59e0b",
            background: "#fffbeb",
            color: "#92400e",
            fontSize: 14,
          }}
        >
          No admin passphrase set yet. Open <Link href="/setup">/setup</Link> to configure one.
        </div>
      )}

      {adminToken && !isAuthed && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            maxWidth: 420,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Admin login</h2>
          <label style={{ display: "grid", gap: 6 }}>
            Passphrase
            <input
              value={inputToken}
              onChange={(event) => setInputToken(event.target.value)}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
          {error && <div style={{ color: "#dc2626", marginTop: 8 }}>{error}</div>}
          <button
            type="button"
            onClick={handleLogin}
            style={{
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #111827",
              background: "#111827",
              color: "white",
              cursor: "pointer",
            }}
          >
            Unlock admin
          </button>
        </div>
      )}

      {isAuthed && (
        <div style={{ marginTop: 24, display: "grid", gap: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Overview</h2>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "white",
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>

          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Campaign drafts</h3>
            {drafts.length === 0 ? (
              <div style={{ color: "#6b7280" }}>No drafts found.</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {drafts.map((draft) => (
                  <div key={draft.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <strong>{draft.title}</strong>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{draft.shortDescription}</div>
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: draft.status === "published" ? "#dcfce7" : "#e0e7ff",
                          color: draft.status === "published" ? "#166534" : "#3730a3",
                          height: "fit-content",
                        }}
                      >
                        {draft.status}
                      </span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                      Goal: {draft.goalAmount || "—"} · Beneficiary: {draft.beneficiaryAddress || "—"}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => handlePublish(draft.id)}
                        disabled={draft.status === "published"}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #d1d5db",
                          background: draft.status === "published" ? "#f3f4f6" : "white",
                          cursor: draft.status === "published" ? "not-allowed" : "pointer",
                        }}
                      >
                        {draft.status === "published" ? "Published" : "Publish"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Exports</h3>
            <p style={{ marginTop: 4, color: "#4b5563" }}>
              Export published campaigns + current config as JSON for external tooling.
            </p>
            <button
              type="button"
              onClick={exportPublished}
              disabled={publishedDrafts.length === 0}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #111827",
                background: publishedDrafts.length === 0 ? "#9ca3af" : "#111827",
                color: "white",
                cursor: publishedDrafts.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              Export published config
            </button>
          </section>

          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Audit log</h3>
            {auditLog.length === 0 ? (
              <div style={{ color: "#6b7280" }}>No audit events yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                {auditLog.map((entry) => (
                  <div key={entry.id} style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 6 }}>
                    <strong>{entry.action}</strong> — {entry.detail}
                    <div style={{ color: "#9ca3af" }}>{new Date(entry.timestamp).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
