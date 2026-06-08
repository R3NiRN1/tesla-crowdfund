Roadmap V1
Goal

Move the repo from a guarded prototype to a usable platform with real creator submission flow, moderation, publish flow, and indexed public listings.

Sequence
1. Architecture freeze

Lock the architecture, source-of-truth policy, and current scaffold boundaries in docs.

2. Production config discipline

Keep setup-mode convenience, but stop treating browser-local config as a production source of truth.

3. Contract V2

Add metadata-aware campaign creation without breaking the existing funding core.

4. Backend foundation

Add a real backend package with wallet auth, user records, moderation records, and submission records.

Backend foundation alpha note: the first backend MVP layer is file-backed and local-alpha only. It introduces the platform state model, review workflow boundary, publish-record boundary, and audit log without yet claiming production storage, production auth, uploads, or an indexed public read model.

5. Submission + uploads

Replace browser-only draft storage with backend-backed drafts, uploads, and moderation states.

6. Creator frontend flow

Replace local draft builder behavior with authenticated backend-backed creator UX.

7. Admin moderation

Replace local-only admin scaffold with real backend-backed moderation and verification controls.

8. Publish flow

Allow approved submissions to be published on-chain through the creator’s wallet, then record the published state server-side.

9. Indexer + public read model

Move public listings toward backend-indexed campaign records rather than raw chain scans alone.

10. Security + release hardening

Tighten docs, auth, limits, validation, and release discipline for credible testnet use and controlled mainnet preparation.

Current blockers
Structural blockers
No backend package yet
No real submission state machine
No real uploads
No authenticated admin
No metadata-aware contract path
Operational blockers
Production config discipline is not yet locked down
Browser-local scaffolding can still be mistaken for production functionality
Definition of “usable V1”

V1 is usable when all of the following are true:

creators can authenticate with wallet signatures
creators can save and edit drafts server-side
creators can upload media
creators can submit for moderation
admins can review and approve/reject submissions
approved creators can publish through wallet interaction
backend records published campaigns
public campaign listings are served from an indexed read model
the repo docs accurately reflect what is real vs scaffold
Out of scope for immediate V1

These may come later, but are not required to complete V1:

third-party KYC integration
embedded wallets / account abstraction
mobile app wrappers
DAO governance
full decentralised media layer as a hard dependency
backend signer custody for publishing
Branching/release model
dev = integration branch
main = verified/release branch
task branches = one focused unit of work from dev
only tested/validated work should move from dev to main
EOF