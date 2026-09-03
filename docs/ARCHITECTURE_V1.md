# Architecture V1

## Purpose

TES Crowdfund has a real on-chain funding core, a provider-neutral backend persistence boundary, and a Next.js alpha frontend. This document began as the V1 architecture record; the V2 remediation notes below supersede its former file-only and static-admin-token assumptions.

## Current Repo Reality

### Real Product Surfaces

- Root Hardhat project for BSC testnet/mainnet deployment, smoke checks, and verification.
- `CampaignFactory.sol` creates campaign contracts for a single ERC-20 token, including the metadata-aware create path used by approved submissions.
- `Campaign.sol` handles contributions, refunds, milestone claims, deadline extension, and optional goal updates.
- Backend submission records store readiness, moderation state, verification notes, publish records, external media references, public campaign projections, and audit entries.
- Frontend creator, admin, and public surfaces can read backend state when `NEXT_PUBLIC_BACKEND_URL` is configured.
- Creator publishing remains wallet-driven. The backend records confirmed publish results but does not sign transactions or custody funds.

### Alpha-Only Boundaries

- File-backed JSON remains a local-development adapter only; production fails closed unless PostgreSQL is configured and migrated.
- Administrative routes require named, role-authorized operator sessions. Creator wallet sessions cannot acquire operator privileges.
- Browser localStorage is still used for setup overrides and local draft fallback data.
- Binary uploads are not stored by the backend. Creators add external media references only.
- Manual verification is a V1 platform review record, not third-party KYC.
- Public listings are served from backend published records, but the read model is still alpha file-backed rather than a production indexer.

## System Boundaries

### 1. On-Chain Responsibilities

The smart contracts are the custody and rule layer.

`CampaignFactory` is responsible for:

- storing the accepted ERC-20 token address
- deploying campaign contracts
- tracking deployed campaign addresses
- emitting campaign creation events
- accepting approved metadata fields through the metadata-aware creation path

`Campaign` is responsible for:

- receiving ERC-20 contributions
- tracking per-backer contributions
- tracking total contributed amount
- refunding contributors after deadline when campaign rules allow it
- allowing milestone claims only when campaign rules permit
- holding funds inside the campaign contract
- enforcing campaign deadline and goal logic

On-chain state is authoritative for:

- token custody
- contribution accounting
- refund rules
- milestone claim rules
- deployed campaign existence

On-chain state is not the place for:

- identity verification
- moderation decisions
- media storage
- admin workflow
- long-form campaign operations state

### 2. Backend Responsibilities

The backend is the alpha platform/control layer.

Current backend responsibilities:

- wallet nonce and signature verification
- campaign submission records
- metadata-aware readiness validation
- guarded submission state transitions
- manual verification records
- moderation decisions and review notes
- publish records after creator-wallet publication
- published-only public campaign projections
- external media reference validation
- creator-authored campaign updates
- audit trail for submission, review, update, and publish activity

Backend state is the alpha source of truth for:

- submission state: `draft`, `pending_review`, `needs_changes`, `approved`, `rejected`, `published`
- readiness state: `incomplete`, `contract-ready`
- manual verification state
- moderation history
- approved metadata and media references
- backend public listing records

Backend state must not:

- hold user private keys
- custody campaign funds
- replace contract balances, refunds, or milestone rules
- become the only evidence for on-chain publication
- claim production durability until persistence, backup, and migration are hardened

### 3. Frontend Responsibilities

The frontend is the user interaction layer.

Public/backer frontend responsibilities:

- wallet connection
- network awareness and wrong-network blocking
- setup/read-only mode messaging
- public published campaign listing
- campaign trust signals
- contribution and claim UX where contract state allows it

Creator frontend responsibilities:

- campaign draft editing
- backend save and submit-for-review flow
- readiness blocker visibility
- needs-changes and review state visibility
- wallet-driven publish UX after approval
- clear local fallback labeling

Admin frontend responsibilities:

- backend review queue
- manual verification controls
- approval, rejection, and needs-changes decisions
- publish record visibility
- backend audit log visibility
- short-lived operator session handling

Frontend state must not be production truth for:

- submissions
- moderation decisions
- verification state
- publish state
- balances, refunds, or milestone claimability
- production runtime config

## Source Of Truth Policy

Production mode must use:

- deployment manifests
- environment/runtime config
- backend platform records
- on-chain contract state
- explicit admin authorization
- durable storage with backup/restore discipline

Browser localStorage may be used for:

- local setup experiments
- local fallback drafts
- developer convenience while backend services are unavailable

Browser localStorage must not be treated as production truth. Specifically:

- `teslaCrowdfundConfig:v1` is not production config truth.
- `teslaCrowdfundDrafts:v1` is not production submission truth.
- `teslaCrowdfundAudit:v1` is not production audit truth.

## Current Launch Gaps

1. Production hosting must configure PostgreSQL TLS, backups, point-in-time recovery, monitoring and restore drills.
2. Production operator credential distribution/rotation or a replacement workforce identity provider remains a hosting decision.
3. Independent security and operational release review remains required.
4. Binary uploads are not implemented; only external media references are supported.
5. Public/backer flows need stronger refund, claimable, deadline, and risk-state copy.
6. Observability and support diagnostics are minimal.
7. Launch docs and rehearsal scripts need a full operator path from fresh clone to testnet rehearsal.

## V1 Target Shape

```text
Frontend
  - public/backer listing and campaign interaction
  - creator submission and wallet publish flow
  - admin moderation and audit console
  - setup/read-only and network guard messaging

Backend
  - wallet auth
  - submission state and readiness
  - moderation and manual verification
  - publish records and public read model
  - audit log and support diagnostics
  - durable persistence path before launch

Contracts
  - custody
  - contribution rules
  - refunds
  - milestone claims
  - campaign creation events
```
