"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import SetupBanner from "@/components/SetupBanner";
import { appendAuditLog, getAuditLog, getCampaignDrafts, type AuditLogEntry, type CampaignDraft } from "@/lib/localCampaigns";
import { usePublicConfig } from "@/lib/usePublicConfig";
import { ZERO_ADDRESS } from "@/lib/publicConfig";

function short(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
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
  const router = useRouter();
  const publicConfig = usePublicConfig();
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  const setupMode = !publicConfig.isConfigured;

  useEffect(() => {
    setDrafts(getCampaignDrafts());
    setAuditLog(getAuditLog());
    const entry = createLogEntry("opened admin", "Visited /admin dashboard");
    setAuditLog(appendAuditLog(entry));
  }, []);

  const hasRpc = !!publicConfig.rpcUrl;
  const hasChainId = publicConfig.chainId !== null;
  const hasFactory = publicConfig.factoryAddress !== ZERO_ADDRESS;
  const hasToken = publicConfig.tokenAddress !== ZERO_ADDRESS;

  const configSummary = useMemo(
    () => ({
      chainId: publicConfig.chainId ?? "—",
      rpc: publicConfig.rpcUrl ? "configured" : "missing",
      factory: short(publicConfig.factoryAddress),
      token: short(publicConfig.tokenAddress),
    }),
    [publicConfig]
  );

  const exportDrafts = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      drafts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tesla-crowdfund-drafts.json";
    anchor.click();
    URL.revokeObjectURL(url);

    const entry = createLogEntry("exported drafts", `Exported ${drafts.length} drafts`);
    setAuditLog(appendAuditLog(entry));
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
          <p style={{ margin: "4px 0", color: "#4b5563" }}>Local-only admin tools (MVP scaffold).</p>
        </div>
        <Link href="/">Back to explorer</Link>
      </header>

      <SetupBanner />

      <div
        style={{
          marginTop: 16,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          color: "#374151",
          fontSize: 13,
        }}
      >
        Admin mode is local-only MVP. No authentication or server storage is enabled yet.
      </div>

      {setupMode && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #f59e0b",
            background: "#fffbeb",
            color: "#92400e",
            fontSize: 13,
          }}
        >
          Setup/read-only mode is active. Draft creation and exports are disabled until addresses are configured.
        </div>
      )}

      <div style={{ marginTop: 24, display: "grid", gap: 20 }}>
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Network status</h2>
          <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
            <div>Expected chain ID: {configSummary.chainId}</div>
            <div>RPC URL: {hasRpc ? "configured" : "missing"}</div>
            <div>Factory address: {hasFactory ? "configured" : "ZERO_ADDRESS"}</div>
            <div>Token address: {hasToken ? "configured" : "ZERO_ADDRESS"}</div>
            {!hasChainId && <div style={{ color: "#dc2626" }}>Chain ID missing. Update setup to enable writes.</div>}
          </div>
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Config summary</h2>
          <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
            <div>Chain ID: {configSummary.chainId}</div>
            <div>RPC: {configSummary.rpc}</div>
            <div>Factory: {configSummary.factory}</div>
            <div>Token: {configSummary.token}</div>
          </div>
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Draft actions</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => router.push("/campaigns/new")}
              disabled={setupMode}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #111827",
                background: setupMode ? "#9ca3af" : "#111827",
                color: "white",
                cursor: setupMode ? "not-allowed" : "pointer",
              }}
            >
              Create campaign draft
            </button>
            <button
              type="button"
              onClick={exportDrafts}
              disabled={setupMode || drafts.length === 0}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: setupMode || drafts.length === 0 ? "#f3f4f6" : "white",
                cursor: setupMode || drafts.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              Export drafts
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
            Draft exports are saved locally as JSON (no server required).
          </div>
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Campaign drafts</h2>
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
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Audit log</h2>
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
    </main>
  );
}
