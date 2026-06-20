# Decisions

## D-001 - The Live GitHub Repo Is Authoritative

The GitHub repo state is the source of truth for branch topology and current code state. Reduced or detached workspaces are not trusted for branch/process decisions.

## D-002 - `dev` Is The Integration Branch

All active work should branch from `dev`. `main` is reserved for verified release-ready merges.

## D-003 - Browser localStorage Is Developer Convenience, Not Production Truth

The following are explicitly not production sources of truth:

- `teslaCrowdfundConfig:v1`
- browser-local campaign drafts
- browser-local admin or audit state

## D-004 - Contracts Remain Focused On Custody And Rules

The contracts are responsible for token custody, contributions, refunds, milestone claims, campaign deadlines, and campaign creation events.

They are not responsible for moderation, verification, media storage, creator workflow state, admin workflow, or platform copy.

## D-005 - Backend Is Mandatory For Real Platform Mode

A real platform requires a backend for wallet auth, submission records, moderation, verification state, publish records, public listing records, audit history, and eventually durable media/storage integrations.

## D-006 - Admin Is Backend-Backed But Still Alpha

The admin route now works against backend moderation and audit endpoints when `NEXT_PUBLIC_BACKEND_URL` is configured. It is still alpha-only until production admin authorization, operational guardrails, and durable audit persistence are complete.

## D-007 - Creator Flow Uses Backend Submissions With A Local Fallback

The creator draft builder can save submissions to the backend, show backend readiness, submit for review, and publish approved campaigns through the creator wallet. Browser localStorage remains a dev fallback only.

## D-008 - Setup Wizard Is Local-Only

The setup wizard is acceptable for local experimentation, but production runtime config must come from deployment manifests, environment/runtime config, and backend-controlled platform state.

## D-009 - Metadata-Aware Publishing Is The V1 Path

Approved creator publishing uses the metadata-aware factory path. Metadata URI, campaign description, goal, duration, milestone descriptions, and milestone amounts come from the approved backend submission.

## D-010 - Publish Remains Wallet-Driven In V1

The backend may approve submissions and record publish results, but the approved creator publishes through their own wallet. The backend does not hold private keys or custody funds.

## D-011 - Manual Verification Is Enough For V1

Verification for V1 is a simple admin-set state with notes. It is not third-party KYC and must not be described as production identity verification.

## D-012 - Public Listings Come From Backend Published Records

Public listings should be served from backend published records so hidden review states are not exposed. Contract reads remain necessary for live funding, deadline, refund, and milestone state.

## D-013 - File-Backed Backend Storage Is A Launch Blocker Until Hardened

The current JSON file store is useful for alpha development but is not launch-ready. Persistence, backup, restore, migration, and data-loss warnings must be addressed before mainnet launch.
