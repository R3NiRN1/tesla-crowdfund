# Launch Runbook And Final Checklist

This runbook is for a fresh operator preparing TES Crowdfund for testnet rehearsal or mainnet launch.

## 1. Environment Setup

Root `.env`:

```bash
BSC_TESTNET_RPC_URL=https://...
BSC_MAINNET_RPC_URL=https://...
DEPLOYER_PRIVATE_KEY=0x...
CONFIRM_MAINNET=YES
BSCSCAN_API_KEY=...
NODE_ENV=production
ADMIN_TOKEN=<24+ character secret>
CORS_ORIGIN=https://your-frontend-origin.example
```

Frontend `frontend/.env.local`:

```bash
NEXT_PUBLIC_BACKEND_URL=https://your-backend-origin.example
NEXT_PUBLIC_RPC_URL=https://...
NEXT_PUBLIC_CHAIN_ID=97
NEXT_PUBLIC_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_BSCSCAN_BASE=https://testnet.bscscan.com
NEXT_PUBLIC_WC_ENABLED=false
NEXT_PUBLIC_WC_PROJECT_ID=
```

Use `chainId 97` for BSC testnet and `chainId 56` for BSC mainnet. Never commit real env files.

## 2. Pre-Launch Checks

Run from the repository root:

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

`npm run preflight` must fail in production if `ADMIN_TOKEN` is weak or `CORS_ORIGIN` is wildcard. Local setup/read-only warnings are acceptable only for local rehearsal.

## 3. Deploy And Rehearse

Testnet:

1. Configure root and frontend env for BSC testnet.
2. Run `npm run deploy:testnet`.
3. Save factory, token, deployer, transaction hashes, and explorer links.
4. Update frontend env with deployed factory/token addresses.
5. Start backend with `NODE_ENV=production`, `ADMIN_TOKEN`, and explicit `CORS_ORIGIN`.
6. Start frontend and verify `/health`, `/admin`, `/campaigns/new`, `/campaigns`, and `/`.
7. Run a creator submission through draft, submit, admin review, approve, wallet publish, public listing, and backer funding confidence checks.

Mainnet:

1. Complete testnet rehearsal without unresolved launch blockers.
2. Use a dedicated deployer wallet funded only for required gas.
3. Set `CONFIRM_MAINNET=YES`.
4. Run `npm run deploy:mainnet`.
5. Update frontend env with mainnet chain, explorer, factory, token, and backend URL.
6. Run the final checklist below before announcing public availability.

## 4. Admin Runbook

1. Open `/admin` with a reviewer wallet connected.
2. Confirm backend health shows expected production config and no wildcard CORS.
3. Enter the admin token only in the page field; do not store it in browser storage.
4. Use Operations snapshot to prioritize `pending_review`, `needs_changes`, and approved-unpublished submissions.
5. For every review, record a moderation note and verification note.
6. Approve only after manual creator/submission verification.
7. Watch approved campaigns until the creator wallet records the backend publish transaction.
8. Use audit filters and `/admin/diagnostics` for support triage.

## 5. Creator Tester Path

1. Connect the creator wallet.
2. Open `/campaigns/new`.
3. Enter title, descriptions, metadata URI, media references, goal, duration, and milestones.
4. Save to backend and resolve all readiness blockers.
5. Submit for review.
6. Track status in `/campaigns`.
7. If needs changes, revise and resubmit.
8. If approved, publish with the same creator wallet; backend must record the confirmed transaction.

## 6. Backer Tester Path

1. Open `/` and inspect Published campaigns.
2. Use filters/sorting to find a campaign.
3. Confirm creator status, platform-reviewed status, contract address, publish transaction, metadata proof, funding progress, and deadline.
4. Confirm wallet/network disabled reasons are clear before connecting.
5. For a live testnet campaign, approve allowance first, then contribute.
6. Confirm transaction pending/confirmed states and refreshed funding progress.
7. Confirm refund and milestone-claim boundaries are explained as contract-controlled.

## 7. Rollback

Contracts are immutable. Rollback applies to frontend/backend/config only:

1. Revert frontend deployment to the previous release artifact.
2. Revert backend deployment to the previous release artifact.
3. Restore backend JSON store from the latest verified backup.
4. Repoint frontend env to the last known-good backend and contract addresses.
5. Disable public links or publish announcements until health, admin diagnostics, and public listing are correct.
6. Record the rollback in release notes with commit SHA, deployment timestamp, and reason.

## 8. Known Limitations

- File-backed backend persistence is alpha-only until backup/restore and migration readiness are completed.
- Remaining dependency-audit findings are release-gated in `docs/SECURITY_THREAT_MODEL.md`.
- In-memory backend rate limiting is an alpha guardrail; production should use edge limits too.
- Manual verification is not third-party KYC.
- The backend never holds private keys or custody funds.

## 9. Final Release Checklist

- [ ] All launch issues #51-#62 are closed.
- [ ] CI is green on the release commit.
- [ ] `npm run preflight` passes with production env.
- [ ] Backend `/health` reports production-ready config.
- [ ] Admin diagnostics load with the production admin token.
- [ ] Testnet rehearsal completed with creator, admin, and backer paths.
- [ ] Backup/restore rehearsal completed.
- [ ] Mainnet deployer wallet, contract addresses, and explorer links are recorded.
- [ ] Public copy clearly separates platform review from contract behavior.
- [ ] Rollback owner and support contact are assigned.
