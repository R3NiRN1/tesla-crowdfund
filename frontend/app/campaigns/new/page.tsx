"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import SetupBanner from "@/components/SetupBanner";
import { upsertCampaignDraft, type CampaignDraft } from "@/lib/localCampaigns";

const emptyDraft = {
  title: "",
  shortDescription: "",
  longDescription: "",
  goalAmount: "",
  startDate: "",
  endDate: "",
  imageUrl: "",
  beneficiaryAddress: "",
  tokenSymbol: "",
};

function createId() {
  if (typeof window !== "undefined" && "crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  return `draft-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export default function NewCampaignPage() {
  const [draft, setDraft] = useState(emptyDraft);
  const [savedId, setSavedId] = useState<string | null>(null);

  const preview = useMemo(() => {
    return {
      ...draft,
      createdAt: new Date().toISOString(),
      status: "draft",
    };
  }, [draft]);

  const saveDraft = () => {
    const now = new Date().toISOString();
    const payload: CampaignDraft = {
      id: savedId ?? createId(),
      title: draft.title.trim() || "Untitled campaign",
      shortDescription: draft.shortDescription.trim(),
      longDescription: draft.longDescription.trim(),
      goalAmount: draft.goalAmount.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate,
      imageUrl: draft.imageUrl.trim(),
      beneficiaryAddress: draft.beneficiaryAddress.trim(),
      tokenSymbol: draft.tokenSymbol.trim(),
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    upsertCampaignDraft(payload);
    setSavedId(payload.id);
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(preview, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${draft.title || "campaign"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>New Campaign Draft</h1>
          <p style={{ margin: "4px 0", color: "#4b5563" }}>Build a campaign payload before deploying.</p>
        </div>
        <Link href="/campaigns">Back to drafts</Link>
      </header>

      <SetupBanner />

      <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <label style={{ display: "grid", gap: 6 }}>
            Title
            <input
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Solar water pumps for villages"
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            Short description
            <input
              value={draft.shortDescription}
              onChange={(event) => setDraft((prev) => ({ ...prev, shortDescription: event.target.value }))}
              placeholder="One-line summary"
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            Goal amount
            <input
              value={draft.goalAmount}
              onChange={(event) => setDraft((prev) => ({ ...prev, goalAmount: event.target.value }))}
              placeholder="100000"
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            Token symbol (optional)
            <input
              value={draft.tokenSymbol}
              onChange={(event) => setDraft((prev) => ({ ...prev, tokenSymbol: event.target.value }))}
              placeholder="TES"
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          Long description
          <textarea
            value={draft.longDescription}
            onChange={(event) => setDraft((prev) => ({ ...prev, longDescription: event.target.value }))}
            rows={5}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "grid", gap: 6 }}>
            Start date
            <input
              type="date"
              value={draft.startDate}
              onChange={(event) => setDraft((prev) => ({ ...prev, startDate: event.target.value }))}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            End date
            <input
              type="date"
              value={draft.endDate}
              onChange={(event) => setDraft((prev) => ({ ...prev, endDate: event.target.value }))}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            Image URL
            <input
              value={draft.imageUrl}
              onChange={(event) => setDraft((prev) => ({ ...prev, imageUrl: event.target.value }))}
              placeholder="https://"
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            Upload image (placeholder)
            <input type="file" disabled style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <span style={{ fontSize: 12, color: "#6b7280" }}>Uploads are coming soon.</span>
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          Beneficiary address
          <input
            value={draft.beneficiaryAddress}
            onChange={(event) => setDraft((prev) => ({ ...prev, beneficiaryAddress: event.target.value }))}
            placeholder="0x..."
            style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={saveDraft}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #111827",
              background: "#111827",
              color: "white",
              cursor: "pointer",
            }}
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={downloadJson}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: "white",
              cursor: "pointer",
            }}
          >
            Download JSON
          </button>
          {savedId && (
            <span style={{ alignSelf: "center", color: "#16a34a", fontSize: 13 }}>
              Draft saved locally.
            </span>
          )}
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Live JSON Preview</h3>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(preview, null, 2)}</pre>
        </div>
      </div>
    </main>
  );
}
