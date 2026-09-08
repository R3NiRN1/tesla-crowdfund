# Backend Alpha MVP

This package is the first backend foundation for TES Crowdfund.

It is intentionally small and dependency-light. It uses Node's built-in HTTP server and a file-backed JSON store so the platform can move beyond browser-only localStorage without adding a database dependency too early.

## What is real in this PR

- A backend process can run locally.
- Campaign submission drafts can be stored and edited server-side.
- Every draft stores a readiness result for the metadata-aware campaign contract.
- Invalid drafts cannot enter review.
- Submission states are guarded: `draft`, `pending_review`, `approved`, `rejected`, and `published`.
- Admin review endpoints exist.
- Publish records can be attached after approval.
- Approved creators publish through their own wallet; the backend records confirmed transaction and campaign metadata but never signs.
- `GET /public/campaigns` exposes a published-only card projection. It is an alpha file-backed read model, not a production indexer.
- Published campaign projections include platform-review, contract-publication, creator-update, and milestone timeline entries.
- Admins can record creator-authored campaign updates after confirming the supplied publisher address matches the approved creator.
- Submissions store up to eight validated external media references with one primary image.
- `GET /submissions/:id/metadata` assembles canonical campaign metadata from backend-stored fields and media references.
- A local audit log records draft and state changes.
- Wallet authentication verifies a five-minute, single-use nonce signed by the requested EVM address.

## Submission readiness

Each submission stores:

```json
{
  "readiness": {
    "state": "incomplete",
    "reasons": ["metadataURI: is required"],
    "checkedAt": "2026-06-12T00:00:00.000Z"
  }
}
```

`readiness.state` is either `incomplete` or `contract-ready`. The validator checks `creatorAddress`, `title`, `shortDescription`, `contractInput.description`, `metadataURI`, `goal`, `duration`, milestone descriptions, and milestone amounts. Goal and milestone totals are parsed with `BigInt`, and milestone amounts must add up exactly to the goal.

Drafts and `needs_changes` submissions can be edited with `PATCH /submissions/:id`. A submission can only move to `pending_review` when it is `contract-ready`. The remaining guarded transitions are:

```text
draft -> pending_review
pending_review -> needs_changes | approved | rejected
needs_changes -> pending_review
approved -> published
rejected -> terminal
published -> terminal
```

## What is still alpha-only

- Persistence is file-backed JSON in `backend/data`.
- Backup, restore, and store validation scripts exist for launch rehearsal, but this is still not durable production storage.
- Creator wallet sessions and named operator sessions are separate. Production requires PostgreSQL plus an active operator; see `docs/BACKEND_PERSISTENCE.md` and `docs/OPERATOR_AUTH.md`.
- Production startup also requires an explicit `CORS_ORIGIN`; wildcard CORS is rejected.
- Admin verification is a manual V1 record, not third-party KYC.
- Signed wallet authentication proves control of an address, but creator mutations are not yet session-authorized.
- Binary uploads and media hosting are not implemented. Creators must first host files on IPFS, Arweave, or HTTPS storage and save those external references.
- The metadata endpoint assembles JSON but does not publish it; its resulting external `metadataURI` must be saved before review.
- This backend is not production storage.

## Commands

From the repo root:

```bash
npm run backend:check
npm run backend:store:check
npm run backend:backup
npm run backend:dev
```

Restore from a checked backup:

```bash
npm run backend:restore -- ./ops/backups/backend-store-rehearsal.json
```

See `docs/PERSISTENCE_BACKUP.md` for backup cadence, restore rehearsal, migration notes, and data-loss warnings.

The server defaults to:

```text
http://localhost:8787
```

Override the port:

```bash
BACKEND_PORT=8790 npm run backend:dev
```

Set an admin token:

```bash
STORAGE_DRIVER=file npm run backend:dev
```

Then call admin routes with:

```text
x-admin-token: change-me
```

Production guardrails:

```bash
NODE_ENV=production STORAGE_DRIVER=postgres DATABASE_URL=postgresql://... CORS_ORIGIN=https://app.example npm run backend:dev
```

`POST /auth/nonce` returns the exact message and expiry to sign. Send the address, nonce, and resulting EIP-191 signature to `POST /auth/verify`. Failed signatures do not consume the nonce; successful verification consumes it and replay attempts fail.

## API sketch

```text
GET   /health
GET   /public/campaigns
POST  /auth/nonce
POST  /auth/verify
GET   /submissions
POST  /submissions
GET   /submissions/:id
GET   /submissions/:id/metadata
PATCH /submissions/:id
POST  /submissions/:id/submit
POST  /admin/submissions/:id/review
POST  /admin/submissions/:id/updates
POST  /submissions/:id/published
GET   /audit
```
