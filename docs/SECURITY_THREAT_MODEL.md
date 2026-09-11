# Security Threat Model And Release Guardrails

## Scope

TES Crowdfund keeps campaign funds and publishing in user wallets and campaign contracts. The backend stores submissions, review decisions, audit events, public read-model records, auth nonces, and creator updates. It must not custody private keys or funds.

## Primary Risks

- Operator route abuse: mitigated with named server-side identities, hashed short-lived sessions, explicit roles, production durable-storage/startup checks, and attributable audit events.
- Cross-origin misuse: production requires explicit `CORS_ORIGIN`; wildcard CORS is local-alpha only.
- Wallet replay: backend wallet auth uses five-minute single-use nonces and consumes a nonce only after successful signature verification.
- Request flooding: backend routes use in-memory per-IP buckets by route group. This is an alpha guardrail, not a substitute for edge or load-balancer rate limits.
- Invalid campaign metadata: submission validation limits text lengths, media references, URI schemes, milestone counts, uint256 values, and milestone totals.
- Local-only authority drift: browser state may guide setup or form entry, but backend submissions, audit records, and wallet transactions remain launch truth.

## Required Launch Configuration

- `NODE_ENV=production`
- `STORAGE_DRIVER=postgres`, `DATABASE_URL`, applied migrations, and at least one active named review operator.
- `CORS_ORIGIN` set to the exact deployed frontend origin.
- `NEXT_PUBLIC_BACKEND_URL` set in the frontend environment.
- `NEXT_PUBLIC_FACTORY_ADDRESS` and `NEXT_PUBLIC_TOKEN_ADDRESS` set to deployed contract addresses for live launch.
- A repository ruleset that targets `dev` and requires the aggregate `CI` check.
  The aggregate job depends on all five backend, contract, deploy/smoke, preflight,
  and frontend jobs and fails unless every job succeeds. A repository administrator
  must still verify the ruleset targets the intended branch before merge.

## Dependency Audit

The remediation pins `next` and `eslint-config-next` to `16.3.3`. On 2026-09-08,
compatible lockfile-only updates moved Browserslist to `4.28.9` and `@humanfs/node`
to `0.16.8`; a clean frontend install, audit, lint, TypeScript check, and production
build then passed with zero reported frontend vulnerabilities.

The isolated Hardhat 3 / Viem candidate at code commit
`a2762956b7cb78894b5a19ea59114f833073a1b9` removes the seven High findings
from the Hardhat 2 / Ethers 5 tree. Its root audit passes the existing
High/Critical threshold and reports three Moderate findings through Hardhat's
`adm-zip` dependency; npm offers only a forced Hardhat downgrade, which is not an
approved fix. Solidity remains pinned to 0.8.20 and EVM target `paris`; executable
bytecode matches the PR #74 baseline after normalising only compiler metadata
hashes.

This result does not clear the release gate. At draft PR #75 predecessor head
`609b35c517984a79b20b7d13d5c32f34f3a512fa`, every code-controlled CI and
security job passed. GitHub Dependency Review remains unavailable until a
repository administrator enables Dependency Graph, the new aggregate `CI`
context still requires exact-head verification, and unresolved human review
threads remain. Do not launch or merge on the basis of automated evidence alone.

## Release Rules

- Never merge with failing checks.
- Never publish from backend-held keys.
- Never treat localStorage as production truth.
- Never enable wildcard CORS in production.
- Never run operator routes in production without durable storage, migrations, named identities and server-side roles.
- Re-run `npm run preflight`, `npm run backend:check`, `npm run test:contracts`, `npm --prefix frontend run lint`, and `npm run build:frontend` for release candidates.
