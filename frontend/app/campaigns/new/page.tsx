"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import AlphaNavigation from "@/components/AlphaNavigation";
import SetupBanner from "@/components/SetupBanner";
import {
  buildDraftReadiness,
  upsertCampaignDraft,
  type CampaignDraft,
  type CampaignMilestoneDraft,
} from "@/lib/localCampaigns";

type DraftFormState = {
  title: string;
  shortDescription: string;
  longDescription: string;
  goalAmount: string;
  startDate: string;
  endDate: string;
  imageUrl: string;
  beneficiaryAddress: string;
  tokenSymbol: string;
  milestones: CampaignMilestoneDraft[];
};

const emptyDraft: DraftFormState = {
  title: "",
  shortDescription: "",
  longDescription: "",
  goalAmount: "",
  startDate: "",
  endDate: "",
  imageUrl: "",
  beneficiaryAddress: "",
  tokenSymbol: "TES",
  milestones: [{ id: "milestone-1", description: "", amount: "" }],
};

function createId(prefix = "draft") {
  if (typeof window !== "undefined" && "crypto" in window && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function trimMilestones(milestones: CampaignMilestoneDraft[]) {
  return milestones.map((milestone) => ({
    ...milestone,
    description: milestone.description.trim(),
    amount: milestone.amount.trim(),
  }));
}

export default function NewCampaignPage() {
  const [draft, setDraft] = useState<DraftFormState>(emptyDraft);
  const [savedId, setSavedId] = useState<string | null>(null);

  const readiness = useMemo(() => buildDraftReadiness(draft), [draft]);

  const preview = useMemo(() => {
    return {
      ...draft,
      title: draft.title.trim(),
      shortDescription: draft.shortDescription.trim(),
      longDescription: draft.longDescription.trim(),
      goalAmount: draft.goalAmount.trim(),
      imageUrl: draft.imageUrl.trim(),
      beneficiaryAddress: draft.beneficiaryAddress.trim(),
      tokenSymbol: draft.tokenSymbol.trim(),
      milestones: trimMilestones(draft.milestones),
      readiness: readiness.readiness,
      readinessReasons: readiness.reasons,
      contractInput: readiness.contractInput,
      durationSeconds: readiness.durationSeconds,
      milestoneTotal: readiness.milestoneTotal,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
  }, [draft, readiness]);

  const updateMilestone = (id: string, patch: Partial<CampaignMilestoneDraft>) => {
    setDraft((prev) => ({
      ...prev,
      milestones: prev.milestones.map((milestone) => (milestone.id === id ? { ...milestone, ...patch } : milestone)),
    }));
  };

  const addMilestone = () => {
    setDraft((prev) => ({
      ...prev,
      milestones: [...prev.milestones, { id: createId("milestone"), description: "", amount: "" }],
    }));
  };

  const removeMilestone = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      milestones: prev.milestones.filter((milestone) => milestone.id !== id),
    }));
  };

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
      milestones: trimMilestones(draft.milestones),
      readiness: readiness.readiness,
      readinessReasons: readiness.reasons,
      contractInput: readiness.contractInput,
      durationSeconds: readiness.durationSeconds,
      milestoneTotal: readiness.milestoneTotal,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    upsertCampaignDraft(payload);
    setSavedId(payload.id);
  };

  const downloadJson = () => {
    const payload = {
      ...preview,
      exportedAt: new Date().toISOString(),
      localOnly: true,
      note: "Local-only draft export. This does not deploy or publish on-chain.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
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
            <p>
              Save a browser-only campaign draft and prepare the exact local payload for
              CampaignFactory.createCampaign.
            </p>
          </div>
          <Link className="button-link" href="/campaigns">
            Campaign drafts
          </Link>
        </header>

        <AlphaNavigation active="new" />
        <SetupBanner />

        <div className="panel-warning">
          Drafts and downloaded JSON are local-only scaffold artifacts. They do not deploy a campaign, submit to a
          backend, or publish anything on-chain.
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
                placeholder="One-line contract description"
              />
            </label>
            <label className="form-field">
              Goal amount
              <input
                value={draft.goalAmount}
                onChange={(event) => setDraft((prev) => ({ ...prev, goalAmount: event.target.value }))}
                placeholder="100"
                inputMode="decimal"
              />
              <span className="small muted">Entered as token amount; JSON converts it to 18-decimal token units.</span>
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
            <span className="small muted">Optional local metadata; it is not part of createCampaign inputs.</span>
          </label>
        </section>

        <section className="panel">
          <div className="split-row">
            <div>
              <h2>Milestones</h2>
              <p className="section-subtitle">
                Each milestone needs a description and positive amount. Amounts must sum exactly to the goal.
              </p>
            </div>
            <button type="button" onClick={addMilestone} className="button-primary">
              Add milestone
            </button>
          </div>

          <div className="milestone-list" style={{ marginTop: 14 }}>
            {draft.milestones.length === 0 ? (
              <div className="empty-state">
                <strong>No milestones yet.</strong>
                <p>Add at least one milestone to make the draft contract-ready.</p>
              </div>
            ) : (
              draft.milestones.map((milestone, index) => (
                <div key={milestone.id} className="draft-item">
                  <div className="split-row">
                    <strong>Milestone {index + 1}</strong>
                    <button
                      type="button"
                      onClick={() => removeMilestone(milestone.id)}
                      className="button-secondary"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="form-grid" style={{ marginTop: 10 }}>
                    <label className="form-field">
                      Description
                      <input
                        value={milestone.description}
                        onChange={(event) => updateMilestone(milestone.id, { description: event.target.value })}
                        placeholder="Release build docs and bill of materials"
                      />
                    </label>
                    <label className="form-field">
                      Amount
                      <input
                        value={milestone.amount}
                        onChange={(event) => updateMilestone(milestone.id, { amount: event.target.value })}
                        placeholder="40"
                        inputMode="decimal"
                      />
                    </label>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <div className="split-row">
            <div>
              <h2>Contract readiness</h2>
              <p className="section-subtitle">
                This checks local draft data against CampaignFactory.createCampaign inputs before any future deploy flow.
              </p>
            </div>
            <span className={`badge ${readiness.readiness === "contract-ready" ? "badge-success" : "badge-warning"}`}>
              {readiness.readiness === "contract-ready" ? "Ready" : "Not ready"}
            </span>
          </div>

          <div className="stats-grid" style={{ marginTop: 14 }}>
            <div className="stat-card">
              <span className="stat-label">Duration</span>
              <span className="stat-value">
                {readiness.durationSeconds !== null ? `${readiness.durationSeconds} seconds` : "not ready"}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Milestone total</span>
              <span className="stat-value">
                {readiness.milestoneTotal || "0"} / {readiness.goalAmount || "not set"} {draft.tokenSymbol || "TES"}
              </span>
            </div>
          </div>

          {readiness.reasons.length === 0 ? (
            <div className="panel-success" style={{ marginTop: 14 }}>
              No blockers. The JSON contractInput object matches the current createCampaign input shape.
            </div>
          ) : (
            <div className="panel-warning" style={{ marginTop: 14 }}>
              <strong>Blocking reasons</strong>
              <ul style={{ marginBottom: 0 }}>
                {readiness.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="button-row" style={{ marginTop: 16 }}>
            <button type="button" onClick={saveDraft} className="button-primary">
              Save local draft
            </button>
            <button type="button" onClick={downloadJson} className="button-secondary">
              Download JSON
            </button>
            {savedId && (
              <span className="small muted">
                Draft saved locally as {readiness.readiness === "contract-ready" ? "contract-ready" : "incomplete"}.
              </span>
            )}
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
