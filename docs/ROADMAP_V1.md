# Roadmap V1

## Goal

Move the repo from a guarded MVP into a launch-ready product with understandable creator, admin, and backer flows; clear platform versus contract boundaries; and repeatable launch operations.

## Completed MVP Sequence

1. Architecture and source-of-truth boundaries documented.
2. Production config discipline and setup/read-only guardrails introduced.
3. Metadata-aware campaign creation path added.
4. File-backed backend foundation added.
5. Backend submission readiness and guarded state machine added.
6. Creator backend submission flow connected to the existing draft builder.
7. Backend admin moderation and manual verification connected.
8. Approved creator wallet publish flow connected and backend publish records added.
9. Backend public read model added for published campaigns.
10. Trust layer, media references, auth signatures, guardrails, tests, and MVP docs hardened.

## Active Launch Sequence

1. Product flow audit and launch UX map.
2. Trust and transparency polish.
3. Creator guidance and operational readiness.
4. Backer UX, campaign discovery, and contribution confidence.
5. Admin operations dashboard and audit confidence.
6. Observability, error handling, and support diagnostics.
7. Security, abuse controls, and release guardrails.
8. Launch docs, runbooks, and final release checklist.
9. Persistence, backup, and migration readiness.
10. End-to-end QA, smoke test, and launch rehearsal.
11. Public clarity, consent, and platform boundary copy.

## Current Launch Blockers

### Product Understanding

- Creator, admin, and backer flows need stronger next-action guidance at each state.
- Public pages need clearer platform-reviewed versus contract-based language.
- Backer refund, claimable, deadline, and risk states need clearer copy and discovery paths.
- The tester guide still contains pre-backend local-only flow language and must be refreshed during launch docs work.

### Operations

- Admin queue filtering, audit filtering, support diagnostics, and health/status surfaces are not launch-ready.
- File-backed backend storage needs backup, restore, export/import, migration, and data-loss warnings before launch.
- A full fresh-clone-to-testnet rehearsal path is not yet documented.

### Security And Release

- Creator mutations need full signed-session enforcement beyond nonce verification.
- Admin authorization is token-based alpha discipline, not a role-based production model.
- Rate limits, CORS/env discipline, dependency audit, branch rules, rollback notes, and incident response need final review.
- Mainnet remains blocked until independent contract/security review and production operations are complete.

## Definition Of Launch-Ready V1

V1 is launch-ready when all of the following are true:

- creators can understand every draft, readiness, review, needs-changes, approval, rejection, publish, and published state
- admins can safely review, verify, request changes, reject, approve, inspect publish records, and audit decisions without local-only production state
- backers can see campaign status, creator status, contract address, transaction evidence, metadata proof, funding progress, deadline, refund, and milestone claim state
- wallet/network disabled reasons are clear before any transaction
- backend platform state is durable, backed up, restorable, and migration-ready
- launch setup, testnet rehearsal, rollback, and release checklist are documented and repeatable
- frontend, backend, contract, and docs checks pass from a fresh checkout

## Out Of Scope For Immediate V1

- third-party KYC integration
- embedded wallets or account abstraction
- mobile app wrappers
- DAO governance
- full decentralized media layer as a hard dependency
- backend signer custody for publishing

## Branching And Release Model

- `dev` = integration branch
- `main` = verified release branch
- task branches = one focused unit of work from `dev`
- only tested and validated work should move from `dev` to `main`
