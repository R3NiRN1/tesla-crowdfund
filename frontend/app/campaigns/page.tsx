"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AlphaNavigation from "@/components/AlphaNavigation";
import SetupBanner from "@/components/SetupBanner";
import { buildDraftReadiness, getCampaignDrafts, type CampaignDraft } from "@/lib/localCampaigns";

export default function CampaignsPage() {
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);

  useEffect(() => {
    setDrafts(getCampaignDrafts());
  }, []);

  return (
    <main className="alpha-shell">
      <div className="alpha-container">
        <header className="alpha-header">
          <div>
            <p className="eyebrow">Local scaffold</p>
            <h1>Campaign drafts</h1>
            <p>
              Drafts are local-only, not authenticated, not production moderation, and stored in browser localStorage.
              They are not deployed and do not create on-chain campaigns.
            </p>
          </div>
          <Link className="button-primary" href="/campaigns/new">
            New draft
          </Link>
        </header>

        <AlphaNavigation active="drafts" />
        <SetupBanner />

        <div className="panel-warning">
          Campaign drafts and review states are local-only scaffold data for alpha planning. They are not authenticated,
          not production moderation, and are stored in browser localStorage.
        </div>

        {drafts.length === 0 ? (
          <section className="empty-state">
            <strong>No local drafts yet.</strong>
            <p>Create a draft to shape campaign copy, goal amounts, beneficiary details, and milestone planning.</p>
            <div className="button-row" style={{ marginTop: 12 }}>
              <Link className="button-primary" href="/campaigns/new">
                New draft
              </Link>
              <Link className="button-link" href="/">
                Deployed campaigns
              </Link>
            </div>
          </section>
        ) : (
          <section className="draft-list" aria-label="Local campaign drafts">
            {drafts.map((draft) => (
              <DraftListItem key={draft.id} draft={draft} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function DraftListItem({ draft }: { draft: CampaignDraft }) {
  const readiness = buildDraftReadiness(draft);
  const isReady = readiness.readiness === "contract-ready";

  return (
    <article className="draft-item">
      <div className="split-row">
        <div>
          <strong>{draft.title || "Untitled campaign"}</strong>
          <div className="small muted">{draft.shortDescription || "No summary yet."}</div>
        </div>
        <div className="button-row">
          <span className={`badge ${isReady ? "badge-success" : "badge-warning"}`}>
            {isReady ? "contract-ready" : "incomplete"}
          </span>
          <span className="badge badge-muted">review: {draft.reviewState ?? "draft"}</span>
        </div>
      </div>
      <div className="small muted" style={{ marginTop: 8 }}>
        Goal: {draft.goalAmount || "not set"} | Milestone total: {readiness.milestoneTotal || "0"} | Duration:{" "}
        {readiness.durationSeconds !== null ? `${readiness.durationSeconds}s` : "not ready"}
      </div>
      <div className="small muted" style={{ marginTop: 4 }}>
        Milestones: {draft.milestones.length} | Beneficiary: {draft.beneficiaryAddress || "not set"}
      </div>
      {draft.adminNote && (
        <div className="small muted" style={{ marginTop: 4 }}>
          Admin note: {draft.adminNote}
        </div>
      )}
      {!isReady && readiness.reasons.length > 0 && (
        <div className="small muted" style={{ marginTop: 8 }}>
          First blocker: {readiness.reasons[0]}
        </div>
      )}
      <div className="small muted" style={{ marginTop: 4 }}>
        Updated: {new Date(draft.updatedAt).toLocaleString()}
      </div>
    </article>
  );
}
