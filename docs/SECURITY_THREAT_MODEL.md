# Security Threat Model And Release Guardrails

## Scope

TES Crowdfund keeps campaign funds and publishing in user wallets and campaign contracts. The backend stores submissions, review decisions, audit events, public read-model records, auth nonces, and creator updates. It must not custody private keys or funds.

## Primary Risks

- Admin route abuse: mitigated with `ADMIN_TOKEN`, production startup checks, admin-only diagnostics, audit events, and launch preflight checks.
- Cross-origin misuse: production requires explicit `CORS_ORIGIN`; wildcard CORS is local-alpha only.
- Wallet replay: backend wallet auth uses five-minute single-use nonces and consumes a nonce only after successful signature verification.
- Request flooding: backend routes use in-memory per-IP buckets by route group. This is an alpha guardrail, not a substitute for edge or load-balancer rate limits.
- Invalid campaign metadata: submission validation limits text lengths, media references, URI schemes, milestone counts, uint256 values, and milestone totals.
- Local-only authority drift: browser state may guide setup or form entry, but backend submissions, audit records, and wallet transactions remain launch truth.

## Required Launch Configuration

- `NODE_ENV=production`
- `ADMIN_TOKEN` set to at least 24 characters.
- `CORS_ORIGIN` set to the exact deployed frontend origin.
- `NEXT_PUBLIC_BACKEND_URL` set in the frontend environment.
- `NEXT_PUBLIC_FACTORY_ADDRESS` and `NEXT_PUBLIC_TOKEN_ADDRESS` set to deployed contract addresses for live launch.
- Branch protection on `dev` requiring CI to pass before merge.

## Dependency Audit

On June 20, 2026, frontend audit review found direct Next.js advisories and wallet-stack advisories. This PR upgrades `next` and `eslint-config-next` to `16.2.9` and runs a non-forced `npm audit fix` to apply compatible transitive updates without changing wallet publishing behavior.

Remaining audit findings require breaking `ethers`, `wagmi`, `viem`, or wallet-connector upgrades, or a separate Next/PostCSS advisory decision. Do not launch mainnet until those findings are accepted with compensating controls or resolved through a dedicated dependency-upgrade and wallet regression pass.

## Release Rules

- Never merge with failing checks.
- Never publish from backend-held keys.
- Never treat localStorage as production truth.
- Never enable wildcard CORS in production.
- Never run admin routes in production without `ADMIN_TOKEN`.
- Re-run `npm run preflight`, `npm run backend:check`, `npm run test:contracts`, `npm --prefix frontend run lint`, and `npm run build:frontend` for release candidates.
