cat > docs/ARCHITECTURE_V1.md <<'EOF'
# Architecture V1

## Purpose

Tesla Crowdfund currently has a strong on-chain funding core and a usable frontend shell, but the platform layer is still incomplete. This document fixes the V1 architecture in writing so future work does not drift.

## Current repo reality

### What is already real
- Root Hardhat project for BSC testnet/mainnet deployment, smoke checks, and verification.
- `CampaignFactory.sol` creates campaign contracts for a single ERC-20 token.
- `Campaign.sol` handles contributions, refunds, milestone claims, deadline extension, and optional goal updates.
- Frontend explorer/funding UI can read campaigns and block writes in setup mode or wrong-network mode.
- CI/preflight/setup-mode guardrails already exist.

### What is still scaffold/MVP
- Browser-local config override via `teslaCrowdfundConfig:v1`.
- `/setup` writes config only to browser localStorage.
- `/admin` is local-only and unauthenticated.
- `/campaigns/new` saves drafts only in browser localStorage / JSON download.
- Image upload is placeholder-only.
- There is no real backend-backed submission, moderation, or publish flow yet.

---

## System boundaries

## 1) On-chain responsibilities

The smart contracts are the trust layer.

### `CampaignFactory`
Responsible for:
- storing the single accepted ERC-20 token address
- deploying new campaign contracts
- tracking deployed campaign addresses
- emitting campaign creation events

### `Campaign`
Responsible for:
- receiving ERC-20 contributions
- tracking per-backer contributions
- tracking total contributed amount
- refunding contributors after deadline if goal is not met
- allowing milestone claims only when campaign rules permit
- holding funds inside the contract
- enforcing campaign deadline/goal logic

### On-chain is authoritative for
- token custody
- contribution accounting
- refund rules
- milestone claim rules
- deployed campaign existence

### On-chain is **not** the place for
- identity verification
- moderation state
- image storage
- long-form campaign metadata
- admin workflow
- submission review queue

---

## 2) Backend responsibilities

The backend is the platform/control layer.

V1 backend responsibilities:
- wallet auth (nonce + signature)
- creator identity/verification state
- draft campaign records
- image upload/storage
- metadata assembly and persistence
- moderation queue and moderation decisions
- audit trail for admin actions
- published campaign records
- event indexing/read model for public listings

### Backend becomes the source of truth for
- submission state (`draft`, `pending_review`, `approved`, `rejected`, `published`)
- verification state
- moderation history
- uploaded media references
- metadata records used for publication
- indexed public campaign listing state

### Backend must **not**
- hold user private keys
- custody campaign funds
- replace contract rules with server-side trust
- become the only source of truth for balances or refunds

---

## 3) Frontend responsibilities

The frontend is the user interaction layer.

### Public frontend responsibilities
- wallet connection
- network awareness / wrong-network blocking
- setup/read-only mode messaging
- public campaign explorer
- campaign detail views
- contribution and claim UX

### Creator frontend responsibilities
- draft creation/edit UI
- upload UX
- submit-for-review UX
- publish-in-wallet UX after approval
- draft status visibility

### Admin frontend responsibilities
- moderation queue UI
- approval/rejection UI
- verification controls
- audit log visibility

### Frontend must **not** be the production source of truth for
- submission records
- moderation state
- verification state
- publish state
- authoritative runtime config via browser localStorage

---

## Source of truth policy

### Production source of truth
Production mode must use:
- deployment manifests
- environment/runtime config
- backend submission/moderation data
- on-chain contract state

### Development-only convenience
Browser localStorage may be used for:
- local setup experiments
- local UI scaffolding
- temporary developer convenience

### But localStorage must **not** be treated as production truth
Specifically:
- `teslaCrowdfundConfig:v1` is not production truth
- local draft records are not production truth
- local admin state is not production truth

---

## Current gaps between repo and target platform

1. Contract creation is description-driven, not metadata-driven.
2. Creator flow is local draft UX, not backend-backed submission.
3. Admin is local-only, not authenticated.
4. Uploads are not implemented.
5. Public explorer still leans on direct chain reads instead of a backend read model.
6. Browser-local config can override env/runtime behavior, which is risky for production.

---

## V1 target state

A complete V1 platform should look like this:

```text
Frontend
  ├─ public explorer
  ├─ creator dashboard
  ├─ admin moderation console
  └─ publish-in-wallet flow
        ↓
Backend
  ├─ auth
  ├─ uploads
  ├─ submission state
  ├─ moderation
  ├─ verification state
  └─ indexed read model
        ↓
Contracts
  ├─ custody
  ├─ contribution rules
  ├─ refunds
  └─ milestone claims