# Launch UX Map

This audit documents the LAUNCH-01 product flow review for issue #52. It maps the creator, admin, and backer journeys, calls out confusing states, and records the low-risk fixes made before deeper launch work.

## Source-Of-Truth Ladder

1. Contracts are authoritative for custody, contributions, deadlines, refunds, and milestone claims.
2. Backend records are authoritative for alpha submission state, readiness, review decisions, manual verification, publish records, public listing records, external media references, and audit history.
3. Browser localStorage is a dev fallback for setup overrides and local draft data. It is not production truth.

## Creator Journey

1. Creator opens `/campaigns/new`.
2. Creator connects a wallet and fills title, short description, long description, goal, dates, metadata URI, milestones, and optional media references.
3. Local readiness explains `incomplete` versus `contract-ready` before any backend call.
4. Creator saves to backend when `NEXT_PUBLIC_BACKEND_URL` is configured.
5. Backend returns readiness with reasons and checked timestamp.
6. Creator submits only a `contract-ready` backend draft for review.
7. Creator watches submission status: `draft`, `pending_review`, `needs_changes`, `approved`, `rejected`, or `published`.
8. Approved creator publishes through their connected wallet.
9. Backend records the publish transaction and campaign address after the wallet transaction confirms.

### Creator Confusion Points

- Local JSON and localStorage draft fallback are visible beside backend submission state. They are labelled as dev fallback, but future LAUNCH-03 work should make the recommended next action more prominent.
- Needs-changes history is limited to the latest review note in the creator list. LAUNCH-03 should expose the review loop more clearly.
- Metadata JSON can be downloaded from the backend, but the app does not publish metadata to IPFS, Arweave, or HTTPS storage. This remains an upload/media operations gap.

## Admin Journey

1. Admin opens `/admin`.
2. Operator configures the backend URL and exchanges a server-provisioned credential for a short-lived operator session.
3. Admin refreshes backend submissions and audit log.
4. Admin reviews submission readiness, creator address, metadata URI, review status, publish status, and manual verification status.
5. Admin records moderation notes and verification notes.
6. Admin chooses `needs_changes`, `rejected`, or `approved`.
7. Backend audit log records saves, state changes, moderation decisions, publish records, and campaign updates.

### Admin Confusion Points

- Operator authorization is server-side and role-based; the final hosting identity provider and credential-distribution policy remain a human deployment choice.
- The page does not yet group queues by state or filter the audit log. This belongs to LAUNCH-05.
- Empty, loading, and error states exist, but support diagnostics are limited. This belongs to LAUNCH-06.

## Backer Journey

1. Backer opens `/`.
2. Backer sees current mode: setup/read-only, demo/local, configured testnet, configured network, or wrong network.
3. Backer sees backend published campaigns when backend URL is configured.
4. Backer can inspect platform-review labels, on-chain evidence labels, creator address, campaign address, transaction link, metadata link, funding progress, deadline, and milestones.
5. Backer connects a wallet and uses guarded approve/contribute controls when setup and network are valid.
6. Backer-facing live funding, refund, and milestone claim state comes from contract reads, not backend trust alone.

### Backer Confusion Points

- The home dashboard mixes three concepts: backend published campaigns, direct factory reads, and demo/local campaigns. Labels are present, but LAUNCH-04 should add discovery filters and clearer campaign detail context.
- Refund and claimable explanations are minimal. LAUNCH-04 should make deadline, refund eligibility, and claim actions visible in plain language.
- Demo/local cards remain useful for setup mode, but they must stay clearly labelled as not on-chain.

## Low-Risk Fixes In LAUNCH-01

- Repaired clipped/stale architecture and decision docs so they no longer claim there is no backend.
- Added this launch UX map with journey states, confusion points, and issue routing.
- Renamed admin navigation and home copy from scaffold language to backend review language while preserving alpha boundary copy.
- Refreshed roadmap blockers so completed MVP items are not shown as current launch blockers.

## Launch Blockers Routed To Later Issues

- LAUNCH-02: stronger public trust copy around platform review, contract evidence, metadata proof, and milestone status.
- LAUNCH-03: creator next-action guidance, needs-changes history, metadata requirements, and publish steps.
- LAUNCH-04: backer discovery, refund/claim confidence, disabled reasons, and contribution confirmation states.
- LAUNCH-05: admin queue filters, audit filtering, verification clarity, and operational warnings.
- LAUNCH-06: health/status surfaces, structured errors, and support diagnostics.
- LAUNCH-07: signed session enforcement, admin authorization, CORS/env/rate-limit review, dependency audit, and threat model.
- LAUNCH-08: operator docs, runbooks, tester guide refresh, rollback notes, and release checklist.
- LAUNCH-09: persistence, backup, export/import, migration, and data-loss warnings.
- LAUNCH-10: full launch rehearsal from fresh clone through testnet publish and public listing.
- LAUNCH-11: public boundary copy for wallet use, consent, platform review limits, testnet/mainnet mode, and public data visibility.
