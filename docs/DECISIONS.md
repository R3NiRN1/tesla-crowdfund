Decisions
D-001 — The live GitHub repo is authoritative

The GitHub repo state is the source of truth for branch topology and current code state. Reduced or detached workspaces are not trusted for branch/process decisions.

D-002 — dev is the integration branch

All active work should branch from dev. main is reserved for verified/release-ready merges.

D-003 — Browser localStorage is developer convenience, not production truth

The following are explicitly not production sources of truth:

teslaCrowdfundConfig:v1
local campaign drafts
local-only admin/audit state
D-004 — Contracts remain focused on custody and rules

The contracts are responsible for:

token custody
contributions
refunds
milestone claims

They are not responsible for:

moderation
verification
media storage
creator workflow state
D-005 — Backend is mandatory for real platform mode

A real platform requires a backend for:

wallet auth
submission records
uploads
moderation
verification state
indexed public listings
D-006 — Current /admin is scaffold only

The current admin route is UX scaffolding only. It is not authenticated and is not production-safe.

D-007 — Current /campaigns/new is scaffold only

The current creator flow is a local draft tool. It is not yet a real publish or submission system.

D-008 — Setup wizard is local-only

The current setup wizard is acceptable for local experimentation, but production runtime config must come from deployment manifests, env/runtime config, and backend-controlled platform state.

D-009 — A metadata-aware contract path is needed

The current factory accepts only description/goal/duration/milestones. A real publish flow needs a metadata-aware V2 contract/factory path.

D-010 — Publish should remain wallet-driven in V1

Default V1 direction:

backend approves submissions
creator publishes through their own wallet
backend records the result

This avoids backend signer custody unless a later decision explicitly changes that.

D-011 — Manual verification is enough for V1

Verification for V1 should be a simple admin-set state, not third-party KYC integration.

D-012 — Public listings should move toward a backend read model

Direct chain reads are acceptable in the prototype stage, but the platform should move toward an indexed backend read model for public listing reliability and moderation alignment.
EOF