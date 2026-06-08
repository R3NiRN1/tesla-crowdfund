# Backend Alpha MVP

This package is the first backend foundation for TES Crowdfund.

It is intentionally small and dependency-light. It uses Node's built-in HTTP server and a file-backed JSON store so the platform can move beyond browser-only localStorage without adding a database dependency too early.

## What is real in this PR

- A backend process can run locally.
- Campaign submissions can be stored server-side.
- Submission states exist:
  - `draft`
  - `pending_review`
  - `approved`
  - `rejected`
  - `published`
- Admin review endpoints exist.
- Publish records can be attached after approval.
- A local audit log records state changes.
- Nonces can be issued and consumed for future wallet auth.

## What is still alpha-only

- Persistence is file-backed JSON in `backend/data`.
- `ADMIN_TOKEN` is optional. If unset, admin endpoints allow a local alpha bypass.
- `/auth/verify` consumes nonces but does not yet cryptographically verify signatures.
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
GET  /health
POST /auth/nonce
POST /auth/verify
GET  /submissions
POST /submissions
GET  /submissions/:id
POST /submissions/:id/submit
POST /admin/submissions/:id/review
POST /submissions/:id/published
GET  /audit
```
