"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";

import AlphaNavigation from "@/components/AlphaNavigation";
import ConnectWallet from "@/components/ConnectWallet";
import SetupBanner from "@/components/SetupBanner";
import WalletBar from "@/components/WalletBar";
import {
  BackendClientError,
  createBackendSubmission,
  getBackendSubmissionMetadata,
  getBackendUrl,
  submitBackendSubmission,
  updateBackendSubmission,
  type BackendSubmission,
  type BackendSubmissionInput,
} from "@/lib/backendClient";
import {
  buildDraftReadiness,
  upsertCampaignDraft,
  type CampaignDraft,
  type CampaignMediaReference,
  type CampaignMilestoneDraft,
} from "@/lib/localCampaigns";

type DraftFormState = {
  title: string;
  shortDescription: string;
  longDescription: string;
  goalAmount: string;
  startDate: string;
  endDate: string;
  media: CampaignMediaReference[];
  metadataURI: string;
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
  media: [],
  metadataURI: "",
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

function trimMedia(media: CampaignMediaReference[]) {
  return media.map((item) => ({
    ...item,
    uri: item.uri.trim(),
    label: item.label.trim(),
    altText: item.altText.trim(),
  }));
}

export default function NewCampaignPage() {
  const { address, isConnected } = useAccount();
  const [draft, setDraft] = useState<DraftFormState>(emptyDraft);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [backendSubmission, setBackendSubmission] = useState<BackendSubmission | null>(null);
  const [backendSavedFingerprint, setBackendSavedFingerprint] = useState<string | null>(null);
  const [backendBusy, setBackendBusy] = useState(false);
  const [backendMessage, setBackendMessage] = useState<string | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  const readiness = useMemo(() => buildDraftReadiness(draft), [draft]);
  const backendUrl = getBackendUrl();

  const preview = useMemo(() => {
    const media = trimMedia(draft.media);
    return {
      ...draft,
      title: draft.title.trim(),
      shortDescription: draft.shortDescription.trim(),
      longDescription: draft.longDescription.trim(),
      goalAmount: draft.goalAmount.trim(),
      imageUrl: media.find((item) => item.primary)?.uri ?? "",
      media,
      metadataURI: draft.metadataURI.trim(),
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

  const backendPayload = useMemo<BackendSubmissionInput>(() => ({
    creatorAddress: address ?? "",
    title: draft.title.trim(),
    shortDescription: draft.shortDescription.trim(),
    longDescription: draft.longDescription.trim(),
    imageUrl: draft.media.find((item) => item.primary)?.uri.trim() ?? "",
    media: trimMedia(draft.media),
    metadataURI: draft.metadataURI.trim(),
    contractInput: readiness.contractInput,
  }), [address, draft, readiness.contractInput]);
  const backendFingerprint = useMemo(() => JSON.stringify(backendPayload), [backendPayload]);
  const hasUnsavedBackendChanges =
    backendSubmission !== null && backendSavedFingerprint !== backendFingerprint;

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

  const addMediaReference = () => {
    setDraft((prev) => ({
      ...prev,
      media: [
        ...prev.media,
        {
          id: createId("media"),
          kind: "image",
          uri: "",
          label: "",
          altText: "",
          primary: prev.media.length === 0,
        },
      ],
    }));
  };

  const updateMediaReference = (id: string, patch: Partial<CampaignMediaReference>) => {
    setDraft((prev) => ({
      ...prev,
      media: prev.media.map((item) => {
        if (patch.primary === true) return item.id === id ? { ...item, ...patch } : { ...item, primary: false };
        return item.id === id ? { ...item, ...patch } : item;
      }),
    }));
  };

  const removeMediaReference = (id: string) => {
    setDraft((prev) => {
      const media = prev.media.filter((item) => item.id !== id);
      if (media.length > 0 && !media.some((item) => item.primary)) media[0] = { ...media[0], primary: true };
      return { ...prev, media };
    });
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
      imageUrl: draft.media.find((item) => item.primary)?.uri.trim() ?? "",
      media: trimMedia(draft.media),
      metadataURI: draft.metadataURI.trim(),
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

  const describeBackendError = (error: unknown) => {
    return error instanceof BackendClientError ? error.message : "Unexpected backend request failure.";
  };

  const saveBackendDraft = async () => {
    setBackendBusy(true);
    setBackendError(null);
    setBackendMessage(null);
    try {
      const submission = backendSubmission
        ? await updateBackendSubmission(backendSubmission.id, backendPayload)
        : await createBackendSubmission(backendPayload);
      setBackendSubmission(submission);
      setBackendSavedFingerprint(backendFingerprint);
      setBackendMessage(`Backend draft saved as ${submission.readiness.state}.`);
    } catch (error) {
      setBackendError(describeBackendError(error));
    } finally {
      setBackendBusy(false);
    }
  };

  const submitForReview = async () => {
    if (!backendSubmission) return;
    setBackendBusy(true);
    setBackendError(null);
    setBackendMessage(null);
    try {
      const submission = await submitBackendSubmission(backendSubmission.id);
      setBackendSubmission(submission);
      setBackendSavedFingerprint(backendFingerprint);
      setBackendMessage("Submission sent for review.");
    } catch (error) {
      setBackendError(describeBackendError(error));
    } finally {
      setBackendBusy(false);
    }
  };

  const downloadBackendMetadata = async () => {
    if (!backendSubmission) return;
    setBackendBusy(true);
    setBackendError(null);
    try {
      const metadata = await getBackendSubmissionMetadata(backendSubmission.id);
      const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${draft.title.trim() || "campaign"}-metadata.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setBackendMessage("Metadata JSON assembled from the current backend submission.");
    } catch (error) {
      setBackendError(describeBackendError(error));
    } finally {
      setBackendBusy(false);
    }
  };

  const canSaveToBackend =
    Boolean(backendUrl) &&
    isConnected &&
    !backendBusy &&
    (!backendSubmission || ["draft", "needs_changes"].includes(backendSubmission.status));
  const canSubmitForReview =
    !backendBusy &&
    backendSubmission !== null &&
    ["draft", "needs_changes"].includes(backendSubmission.status) &&
    backendSubmission.readiness.state === "contract-ready" &&
    !hasUnsavedBackendChanges;

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
            <p className="eyebrow">Creator submission</p>
            <h1>New draft</h1>
            <p>
              Save a campaign draft to the backend, check contract readiness, and submit it for review.
            </p>
          </div>
          <div className="alpha-actions">
            <WalletBar />
            <ConnectWallet />
            <Link className="button-link" href="/campaigns">
              Campaign drafts
            </Link>
          </div>
        </header>

        <AlphaNavigation active="new" />
        <SetupBanner />

        <div className="panel-warning">
          Browser localStorage and JSON downloads remain dev-only fallbacks. Backend submission does not deploy or
          publish anything on-chain.
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
              Metadata URI
              <input
                value={draft.metadataURI}
                onChange={(event) => setDraft((prev) => ({ ...prev, metadataURI: event.target.value }))}
                placeholder="ipfs://... or https://..."
              />
              <span className="small muted">Required by backend contract readiness.</span>
            </label>
          </div>

          <div className="panel-warning" style={{ marginTop: 14 }}>
            Binary uploads are not stored by this alpha backend. Host media on IPFS, Arweave, or HTTPS storage first,
            then add its external reference below.
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="split-row">
              <div>
                <h3>Media references</h3>
                <p className="section-subtitle">Add up to eight references and select exactly one primary image.</p>
              </div>
              <button type="button" className="button-secondary" onClick={addMediaReference} disabled={draft.media.length >= 8}>
                Add media reference
              </button>
            </div>
            {draft.media.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 10 }}>No media references. Media is optional.</div>
            ) : (
              <div className="draft-list" style={{ marginTop: 10 }}>
                {draft.media.map((media, index) => (
                  <div className="draft-item" key={media.id}>
                    <div className="split-row">
                      <strong>Media {index + 1}</strong>
                      <button type="button" className="button-secondary" onClick={() => removeMediaReference(media.id)}>Remove</button>
                    </div>
                    <div className="form-grid" style={{ marginTop: 10 }}>
                      <label className="form-field">
                        Kind
                        <select
                          value={media.kind}
                          onChange={(event) => updateMediaReference(media.id, { kind: event.target.value as CampaignMediaReference["kind"] })}
                        >
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                          <option value="document">Document</option>
                        </select>
                      </label>
                      <label className="form-field">
                        External URI
                        <input
                          value={media.uri}
                          onChange={(event) => updateMediaReference(media.id, { uri: event.target.value })}
                          placeholder="ipfs://... or https://..."
                        />
                      </label>
                      <label className="form-field">
                        Label
                        <input value={media.label} onChange={(event) => updateMediaReference(media.id, { label: event.target.value })} />
                      </label>
                      <label className="form-field">
                        Alt text
                        <input value={media.altText} onChange={(event) => updateMediaReference(media.id, { altText: event.target.value })} />
                      </label>
                    </div>
                    <label className="button-row" style={{ marginTop: 10 }}>
                      <input
                        type="radio"
                        name="primary-media"
                        checked={media.primary}
                        disabled={media.kind !== "image"}
                        onChange={() => updateMediaReference(media.id, { primary: true })}
                      />
                      Primary campaign image
                    </label>
                  </div>
                ))}
              </div>
            )}
            <label className="form-field" style={{ marginTop: 10 }}>
              Binary upload
              <input type="file" disabled />
              <span className="small muted">Unavailable until a real external storage integration is configured.</span>
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
              Save local draft (dev fallback)
            </button>
            <button type="button" onClick={downloadJson} className="button-secondary">
              Download local JSON
            </button>
            {savedId && (
              <span className="small muted">
                Draft saved locally as {readiness.readiness === "contract-ready" ? "contract-ready" : "incomplete"}.
              </span>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="split-row">
            <div>
              <h2>Backend submission</h2>
              <p className="section-subtitle">
                Save first, then use the backend readiness response to submit for review.
              </p>
            </div>
            {backendSubmission && (
              <span className={`badge ${backendSubmission.readiness.state === "contract-ready" ? "badge-success" : "badge-warning"}`}>
                {backendSubmission.readiness.state}
              </span>
            )}
          </div>

          {!backendUrl && (
            <div className="panel-warning" style={{ marginTop: 14 }}>
              Set NEXT_PUBLIC_BACKEND_URL to enable backend saves. The local fallback remains dev-only.
            </div>
          )}
          {backendUrl && !isConnected && (
            <div className="panel-warning" style={{ marginTop: 14 }}>
              Connect the creator wallet before saving to the backend.
            </div>
          )}
          {backendSubmission && (
            <div style={{ marginTop: 14 }}>
              <div className="small muted">
                Submission {backendSubmission.id} | status: {backendSubmission.status} | checked: {backendSubmission.readiness.checkedAt}
              </div>
              {hasUnsavedBackendChanges && (
                <div className="panel-warning" style={{ marginTop: 10 }}>
                  The form changed after the last backend save. Save again before submitting for review.
                </div>
              )}
              {backendSubmission.readiness.reasons.length > 0 && (
                <div className="panel-warning" style={{ marginTop: 10 }}>
                  <strong>Backend readiness blockers</strong>
                  <ul style={{ marginBottom: 0 }}>
                    {backendSubmission.readiness.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {backendMessage && <div className="panel-success" style={{ marginTop: 14 }}>{backendMessage}</div>}
          {backendError && <div className="panel-danger" style={{ marginTop: 14 }}>{backendError}</div>}

          <div className="button-row" style={{ marginTop: 16 }}>
            <button type="button" onClick={saveBackendDraft} className="button-primary" disabled={!canSaveToBackend}>
              {backendBusy ? "Working..." : backendSubmission ? "Update backend draft" : "Save to backend"}
            </button>
            <button
              type="button"
              onClick={submitForReview}
              className={canSubmitForReview ? "button-primary" : "button-disabled"}
              disabled={!canSubmitForReview}
            >
              Submit for review
            </button>
            <button
              type="button"
              onClick={() => void downloadBackendMetadata()}
              className="button-secondary"
              disabled={!backendSubmission || backendBusy || hasUnsavedBackendChanges}
            >
              Download backend metadata JSON
            </button>
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
