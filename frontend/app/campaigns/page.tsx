"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import SetupBanner from "@/components/SetupBanner";
import { getCampaignDrafts, type CampaignDraft } from "@/lib/localCampaigns";

export default function CampaignsPage() {
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);

  useEffect(() => {
    setDrafts(getCampaignDrafts());
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 960, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Campaign Drafts</h1>
          <p style={{ margin: "4px 0", color: "#4b5563" }}>Local drafts saved in this browser.</p>
        </div>
        <Link href="/campaigns/new">New draft</Link>
      </header>

      <SetupBanner />

      {drafts.length === 0 ? (
        <div style={{ marginTop: 24, color: "#6b7280" }}>No drafts yet. Create your first draft.</div>
      ) : (
        <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
          {drafts.map((draft) => (
            <div
              key={draft.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 14,
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <strong>{draft.title || "Untitled campaign"}</strong>
                <span
                  style={{
                    fontSize: 12,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: draft.status === "published" ? "#dcfce7" : "#e0e7ff",
                    color: draft.status === "published" ? "#166534" : "#3730a3",
                  }}
                >
                  {draft.status}
                </span>
              </div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>{draft.shortDescription || "No summary"}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Goal: {draft.goalAmount || "—"} · Beneficiary: {draft.beneficiaryAddress || "—"}
              </div>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>
                Updated: {new Date(draft.updatedAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <Link href="/">Back to explorer</Link>
      </div>
    </main>
  );
}
