# Launch Diagnostics

Use this guide when the app or backend fails during launch rehearsal.

## Backend Health

- `GET /health` is public and returns service status, uptime, production-readiness, safe config flags, and environment warnings.
- Every backend response includes an `x-request-id` header.
- Structured errors include `error.code`, `error.message`, `error.requestId`, `error.timestamp`, and optional `error.detail`.

## Admin Diagnostics

- `GET /admin/diagnostics` requires `x-admin-token` when `ADMIN_TOKEN` is configured.
- It returns submission counts, audit event count, auth nonce count, environment warnings, and the most recent audit events.
- It never returns private keys, wallet secrets, or custody data.

## Common Checks

1. Backend URL missing: set `NEXT_PUBLIC_BACKEND_URL` and reload the admin page.
2. Admin diagnostics rejected: confirm `ADMIN_TOKEN` and the page's Admin token field match.
3. Publish record rejected: compare `creatorAddress`, `publisherAddress`, `metadataURI`, `campaignAddress`, `factoryAddress`, and `transactionHash` in the structured error detail.
4. Wrong network or disabled writes: use the setup wizard and `GET /health` warnings before retrying wallet actions.
5. Support escalation: capture the visible request ID, timestamp, route, wallet address, submission ID, and audit event action.

## Local Limitations

The alpha backend uses file-backed JSON persistence. Treat health and diagnostics as operational visibility, not as production observability infrastructure.
