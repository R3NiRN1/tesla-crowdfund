# TES Crowdfund Launch Tester Guide

Use this guide with `docs/LAUNCH_RUNBOOK.md` and `docs/LAUNCH_REHEARSAL.md` for launch rehearsal. The backend submission store, audit log, wallet transactions, and contract reads are the current launch truth. Browser localStorage is only a setup/form convenience and must not be treated as production authority.

## Roles

- Creator: prepares a backend submission, resolves readiness blockers, submits for review, and publishes approved campaigns through their own wallet.
- Admin: reviews backend submissions, records manual verification, requests changes, approves/rejects, and monitors publish records.
- Backer: inspects published records, verifies trust signals, connects the correct wallet/network, and contributes only through contract transactions.

## Fresh Setup

```bash
npm ci
npm --prefix frontend ci
npm run backend:check
npm run compile
npm run test:contracts
npm run preflight
npm --prefix frontend run lint
npm run build:frontend
```

Start the backend with `npm run backend:dev` for local rehearsal. Start the frontend with `npm --prefix frontend run dev`.

Safe local mode may use `ZERO_ADDRESS` factory/token values. Live testnet rehearsal requires real BSC testnet RPC, factory, token, backend URL, and explorer values.

## Creator Flow

1. Connect the creator wallet.
2. Open `/campaigns/new`.
3. Complete campaign copy, metadata URI, media references, goal, duration, and milestones.
4. Save to backend.
5. Confirm readiness is `contract-ready`; resolve every blocker if not.
6. Submit for review.
7. Open `/campaigns` and confirm status becomes `pending review`.
8. If admin requests changes, revise, save, and resubmit.
9. If approved, publish from the matching creator wallet.
10. Confirm backend publish record stores campaign address, transaction hash, factory, chain, metadata URI, publisher, and timestamp.

Expected disabled reasons:

- Backend URL missing.
- Wallet disconnected.
- Wrong creator wallet for publish.
- Wrong network.
- Submission not approved.
- Backend publish record already exists.

## Admin Flow

1. Open `/admin`.
2. Confirm backend health and environment warnings.
3. Enter the admin token when configured.
4. Filter the review queue by `pending review`, `needs changes`, `approved`, and `published`.
5. Inspect readiness blockers, metadata URI, media references, review history, and audit coverage.
6. For needs changes, enter a clear moderation note and choose `Needs changes`.
7. For rejection, enter a clear moderation note and choose `Reject`.
8. For approval, record verification notes, check manual verification, and choose `Approve verified`.
9. Monitor approved-unpublished campaigns until the creator wallet publishes and the backend record appears.
10. Use audit filters and admin diagnostics for support triage.

## Backer Flow

1. Open `/`.
2. Use Published campaigns filters and sorting.
3. Confirm every card shows platform review, creator verification, contract evidence, metadata proof, campaign status, progress, deadline, and next action.
4. Confirm demo/local records are clearly labelled and cannot be funded.
5. Connect wallet and switch to the configured network.
6. Approve token allowance.
7. Send contribution transaction.
8. Confirm pending and confirmed states are visible.
9. Refresh and confirm funding progress updates.
10. Confirm refund and milestone-claim language says those outcomes are contract-controlled.

## Support Evidence To Capture

- Request ID from structured backend errors.
- Submission ID.
- Connected wallet address.
- Chain ID and explorer link.
- Transaction hash.
- Backend health warnings.
- Relevant audit event action and timestamp.

## Known Launch Blockers

- Production env missing `ADMIN_TOKEN` or explicit `CORS_ORIGIN`.
- Unresolved dependency-audit acceptance or wallet-stack upgrade plan.
- Backup/restore rehearsal not completed.
- Public copy failing to distinguish platform review from contract behavior.
