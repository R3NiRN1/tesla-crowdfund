"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AlphaNavigation from "@/components/AlphaNavigation";
import SetupBanner from "@/components/SetupBanner";
import { getCampaignDrafts, type CampaignDraft } from "@/lib/localCampaigns";

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
            <p>Drafts are saved in this browser only. They are not deployed and do not create on-chain campaigns.</p>
          </div>
          <Link className="button-primary" href="/campaigns/new">
            New draft
          </Link>
        </header>

        <AlphaNavigation active="drafts" />
        <SetupBanner />

        <div className="panel-warning">
          Campaign drafts are local-only scaffold data for alpha planning. Funding and claim actions only appear on
          deployed campaigns from a configured factory.
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
              <article key={draft.id} className="draft-item">
                <div className="split-row">
                  <div>
                    <strong>{draft.title || "Untitled campaign"}</strong>
                    <div className="small muted">{draft.shortDescription || "No summary yet."}</div>
                  </div>
                  <span className={`badge ${draft.status === "published" ? "badge-success" : "badge-muted"}`}>
                    local {draft.status}
                  </span>
                </div>
                <div className="small muted" style={{ marginTop: 8 }}>
                  Goal: {draft.goalAmount || "not set"} | Beneficiary: {draft.beneficiaryAddress || "not set"}
                </div>
                <div className="small muted" style={{ marginTop: 4 }}>
                  Updated: {new Date(draft.updatedAt).toLocaleString()}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
