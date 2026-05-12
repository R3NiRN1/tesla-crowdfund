"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import AlphaNavigation from "@/components/AlphaNavigation";
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
    <main className="alpha-shell">
      <div className="alpha-container">
        <header className="alpha-header">
          <div>
            <p className="eyebrow">Local scaffold</p>
            <h1>New draft</h1>
            <p>Save a browser-only campaign draft. This does not deploy a contract or publish anything on-chain.</p>
          </div>
          <Link className="button-link" href="/campaigns">
            Campaign drafts
          </Link>
        </header>

        <AlphaNavigation active="new" />
        <SetupBanner />

        <div className="panel-warning">
          Drafts and downloaded JSON are local-only scaffold artifacts. They are separate from deployed testnet
          campaigns.
        </div>

        <section className="panel">
          <div className="form-grid">
            <label className="form-field">
              Title
              <input
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Solar water pumps for villages"
              />
            </label>
            <label className="form-field">
              Short description
              <input
                value={draft.shortDescription}
                onChange={(event) => setDraft((prev) => ({ ...prev, shortDescription: event.target.value }))}
                placeholder="One-line summary"
              />
            </label>
            <label className="form-field">
              Goal amount
              <input
                value={draft.goalAmount}
                onChange={(event) => setDraft((prev) => ({ ...prev, goalAmount: event.target.value }))}
                placeholder="100000"
              />
            </label>
            <label className="form-field">
              Token symbol
              <input
                value={draft.tokenSymbol}
                onChange={(event) => setDraft((prev) => ({ ...prev, tokenSymbol: event.target.value }))}
                placeholder="TES"
              />
            </label>
          </div>

          <label className="form-field" style={{ marginTop: 14 }}>
            Long description
            <textarea
              value={draft.longDescription}
              onChange={(event) => setDraft((prev) => ({ ...prev, longDescription: event.target.value }))}
              rows={5}
            />
          </label>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <label className="form-field">
              Start date
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) => setDraft((prev) => ({ ...prev, startDate: event.target.value }))}
              />
            </label>
            <label className="form-field">
              End date
              <input
                type="date"
                value={draft.endDate}
                onChange={(event) => setDraft((prev) => ({ ...prev, endDate: event.target.value }))}
              />
            </label>
            <label className="form-field">
              Image URL
              <input
                value={draft.imageUrl}
                onChange={(event) => setDraft((prev) => ({ ...prev, imageUrl: event.target.value }))}
                placeholder="https://"
              />
            </label>
            <label className="form-field">
              Upload image
              <input type="file" disabled />
              <span className="small muted">Local upload handling remains scaffold-only.</span>
            </label>
          </div>

          <label className="form-field" style={{ marginTop: 14 }}>
            Beneficiary address
            <input
              value={draft.beneficiaryAddress}
              onChange={(event) => setDraft((prev) => ({ ...prev, beneficiaryAddress: event.target.value }))}
              placeholder="0x..."
            />
          </label>

          <div className="button-row" style={{ marginTop: 16 }}>
            <button type="button" onClick={saveDraft} className="button-primary">
              Save local draft
            </button>
            <button type="button" onClick={downloadJson} className="button-secondary">
              Download JSON
            </button>
            {savedId && <span className="small muted">Draft saved locally, not deployed.</span>}
          </div>
        </section>

        <section className="panel">
          <h2>Local JSON preview</h2>
          <pre className="local-json">{JSON.stringify(preview, null, 2)}</pre>
        </section>
      </div>
    </main>
  );
}
