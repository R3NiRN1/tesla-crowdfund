# Launch Rehearsal Runbook

Use this runbook for LAUNCH-10. It is the repeatable path from fresh clone to BSC testnet launch rehearsal. Run it before mainnet, after any release-candidate change, and after restoring backend data.

## 1. Fresh Clone And Install

```bash
git clone https://github.com/R3NiRN1/tesla-crowdfund.git
cd tesla-crowdfund
git switch dev
npm ci
npm --prefix frontend ci
```

Record:

- commit SHA
- operator name
- Node version
- testnet wallet address
- backend URL
- frontend URL

## 2. Environment Setup

Create root `.env` for testnet rehearsal:

```bash
BSC_TESTNET_RPC_URL=https://...
DEPLOYER_PRIVATE_KEY=0x...
BSCSCAN_API_KEY=...
NODE_ENV=production
ADMIN_TOKEN=<24+ character secret>
CORS_ORIGIN=https://your-frontend-origin.example
TESLA_CROWDFUND_BACKEND_DB=/var/lib/tes-crowdfund/backend-store.json
```

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_BACKEND_URL=https://your-backend-origin.example
NEXT_PUBLIC_RPC_URL=https://...
NEXT_PUBLIC_CHAIN_ID=97
NEXT_PUBLIC_FACTORY_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_BSCSCAN_BASE=https://testnet.bscscan.com
NEXT_PUBLIC_WC_ENABLED=false
NEXT_PUBLIC_WC_PROJECT_ID=
```

Use zero addresses only before deployment. After `deploy:testnet`, replace them with the deployed factory and token addresses.

## 3. Offline Rehearsal Gate

Run from the repo root:

```bash
npm run launch:rehearsal
npm run backend:check
npm run backend:store:check
npm run compile
npm run test:contracts
npm run preflight
npm --prefix frontend run lint
npm run build:frontend
```

Expected result:

- `launch:rehearsal` passes with a warning that live testnet strictness is skipped.
- `preflight` may warn about zero factory/token addresses before deployment.
- Frontend build may report dependency audit findings already tracked by the launch security issue; do not ignore new build failures.

## 4. Backup Before Live Steps

```bash
npm run backend:backup -- ./ops/backups/pre-testnet-rehearsal.json
npm run backend:store:check -- ./ops/backups/pre-testnet-rehearsal.json
```

Store a copy outside the app host. Do not store deployer private keys in backend backups.

## 5. Deploy And Smoke Testnet Contracts

```bash
npm run deploy:testnet
npm run smoke:testnet
```

Record:

- factory address
- token address
- deploy transaction hashes
- BscScan links
- deployment JSON file path

Update `frontend/.env.local` with deployed factory/token addresses, then run:

```bash
npm run launch:rehearsal -- --live-testnet
npm run preflight
```

The live rehearsal gate must reject zero addresses, missing backend URL, weak admin token, wildcard CORS, and missing testnet RPC values.

## 6. Start Backend And Frontend

Backend:

```bash
NODE_ENV=production ADMIN_TOKEN=<secret> CORS_ORIGIN=https://your-frontend-origin.example npm run backend:dev
```

Frontend:

```bash
npm --prefix frontend run dev
```

Verify:

- `/health` reports production-ready config.
- `/admin/diagnostics` loads with the admin token.
- `/campaigns/new`, `/campaigns`, `/admin`, and `/` render without console-breaking errors.

## 7. Creator Submission

1. Connect the creator wallet on BSC testnet.
2. Open `/campaigns/new`.
3. Create a creator submission with title, descriptions, metadata URI, image/media references, goal, duration, and milestones.
4. Save to backend.
5. Confirm readiness is `contract-ready`.
6. Submit for review.
7. Open `/campaigns` and confirm status is `pending review`.

Record:

- submission ID
- creator wallet
- metadata URI
- readiness state
- any request ID shown by backend errors

## 8. Admin Approval

1. Open `/admin`.
2. Enter the admin token.
3. Filter to `pending review`.
4. Inspect campaign copy, media references, metadata URI, readiness blockers, review history, and audit history.
5. Add moderation and verification notes.
6. Mark manual verification complete.
7. Approve the submission.
8. Confirm audit log records the review and verification state.

Also rehearse a separate needs-changes path if time allows: request changes, revise as creator, resubmit, and approve.

## 9. Wallet Publish

1. Return to the creator wallet.
2. Confirm wallet is connected to chain `97`.
3. Publish the approved submission from the creator wallet.
4. Confirm the wallet transaction.
5. Wait for confirmation.
6. Confirm backend publish record stores transaction hash, campaign address, factory address, chain ID, metadata URI, publisher address, and timestamp.
7. Open the transaction link on BscScan testnet.

The backend must not sign this transaction or hold the creator private key.

## 10. Public Listing And Backer Contribution

1. Open `/`.
2. Confirm the campaign appears in Published campaigns.
3. Confirm public signals show platform review, creator verification, contract address, transaction hash, metadata proof, milestones, and audit/publish state.
4. Connect a backer wallet on BSC testnet.
5. Approve token allowance if required.
6. Submit a small contribution.
7. Confirm pending, success, explorer link, and refreshed funding progress.

Record:

- backer wallet
- contribution amount
- token approval hash, if any
- contribution transaction hash
- refreshed public progress

## 11. Refund And Claim Smoke Where Feasible

Refund and claim behavior is contract-controlled and depends on time, goal, and milestone state. Do not fake the result in the backend.

Feasible smoke checks:

1. Confirm public copy explains refund eligibility after deadline when the goal is not met.
2. Confirm milestone claim buttons are owner-only and disabled for non-owner wallets.
3. If the rehearsal campaign reaches funding and has enough backer approval, have the creator call claim for one milestone and record the transaction hash.
4. If using a short-duration controlled campaign that misses its goal, wait until deadline and have the contributor call refund, then record the transaction hash.

If claim or refund cannot be executed safely during the rehearsal window, record why and capture screenshots of the disabled reason and contract state.

## 12. Final Evidence Pack

Save:

- command outputs for every check in this runbook
- backend backup file path and external-copy location
- contract addresses and transaction links
- submission ID and public campaign URL
- admin audit event timestamps
- contribution, claim, or refund transaction links
- open limitations and release blockers

A launch rehearsal passes only when all required checks pass, the creator/admin/backer paths are visible, wallet-driven publish is preserved, and any skipped refund/claim smoke has a concrete reason.
