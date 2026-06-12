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
- A local audit log records draft and state changes.
- Nonces can be issued and consumed for future wallet auth.

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
- `ADMIN_TOKEN` is optional. If unset, admin endpoints allow a local alpha bypass.
- `/auth/verify` consumes nonces but does not yet cryptographically verify signatures.
- Admin verification is a manual V1 record, not third-party KYC.
- Uploads are not implemented.
- This backend is not production storage.

## Commands

From the repo root:

```bash
npm run backend:check
npm run backend:dev
```

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
ADMIN_TOKEN=change-me npm run backend:dev
```

Then call admin routes with:

```text
x-admin-token: change-me
```

## API sketch

```text
GET   /health
POST  /auth/nonce
POST  /auth/verify
GET   /submissions
POST  /submissions
GET   /submissions/:id
PATCH /submissions/:id
POST  /submissions/:id/submit
POST  /admin/submissions/:id/review
POST  /submissions/:id/published
GET   /audit
```
