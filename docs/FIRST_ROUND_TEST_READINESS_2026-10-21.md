# First-round test readiness: 2026-10-21

Decision: **HOLD shared BSC testing and branch consolidation.** Developer-only local
rehearsal is available. The completed launch issue queue is not a current security
approval, and `dev` still lacks the V2 security repairs.

## Wallet And Adversarial Follow-Up: 2026-10-22

Issue #77 repairs duplicate wallet submissions, receipt refresh loops and
publication recovery on the unmerged candidate. Its React DOM tests do not
constitute real-wallet acceptance or an independent penetration test. Require
fresh checks on its exact final commit; see [the recovery boundary](WALLET_TRANSACTION_RECOVERY.md).

A bounded local adversarial review also reproduced separate ownership/escrow
liveness, draft-storage amplification and credential/session revocation defects.
These are unresolved release blockers, not accepted limitations. Prior green
tests did not cover them. Shared testing and branch consolidation remain on hold
until focused fixes and independent review are complete. No real funds are
permitted, and isolated local developer testing is not a launch approval.

The default Windows production build passed after the current clean frontend
installation, including static generation of all application routes. This is
fresh successful evidence, not a claim that a source repair for the earlier
host-specific Turbopack failure was identified. Final-head CI remains required.

## Verified local support follow-up

This section supersedes the initial review's local-infrastructure and repository
settings gaps below; the original table remains historical evidence, not current
test status. **Decision remains LOCAL_ONLY; shared launch is on hold.**

- PR #76 commit `514fdfa953917184b0c120d8080a761c2a52b812` passed all
  eleven integrated checks on a clean working tree. `npm run test:local`
  provisions its own PostgreSQL, isolated databases, named operators, six ephemeral
  client signers, MockTES/V2 and local chain. No manual local support setup is needed.
- Persistence across backend restart and logical backup/restore into a separate
  database passed. Private backups remain ignored and are not published.
- [CI run 390](https://github.com/R3NiRN1/tesla-crowdfund/actions/runs/39688210313)
  passed all seven functional jobs, including the default Linux frontend build
  and the automated PostgreSQL/role rehearsal.
- Repository vulnerability alerts were enabled; Dependency Review now passes.
  [The same candidate's security run](https://github.com/R3NiRN1/tesla-crowdfund/actions/runs/39688210363)
  passed secrets, Slither and CodeQL, but its full dependency audit still fails.
- The unpatched `braces` advisory remains a technical blocker. The thirteen
  unresolved security threads need an independent reviewer, not blind risk
  acceptance from the project owner. The [review handoff](security/REVIEW_HANDOFF.md)
  includes source-specific proposals and direct thread links.
- Browser-wallet UX, public test-host evidence, actual chain-97 deployment and
  real 7/14/30-day soak remain unperformed. Default Windows Turbopack still has
  the recorded host failure; a Linux CI build is not a Windows repair.

This is a stacked, unmerged candidate: #76 -> #75 -> #74 -> `dev`. Do not
describe current `dev` as containing these repairs. Preserve branches until
reviewed integration succeeds; never merge a failing audit.

Local support hardening following the clean-commit rehearsal adds explicit
loopback binding, restricted child-process environments, HTTP timeouts, bounded
child termination and cleanup-failure reporting. Six failure-path regression
tests passed, followed by a fresh eleven-check local rehearsal, all seven backend
suites, all eighteen contract tests and frontend lint. See the resulting PR #76
head checks for exact committed-candidate CI status. The unconfigured preflight
still fails as intended; explicit setup-mode configuration passes with warnings.

A subsequent focused agent review reproduced an early-exit hang in the
embedded-postgres lifecycle wrapper and inherited PG client configuration.
The support runner now uses pinned binary packages and native initdb/pg_ctl,
with bounded control commands, private password-file cleanup, isolated parent
configuration and idempotent interruption cleanup. The replacement passed a real
eleven-check local rehearsal. Its expanded regression suite passed 24 cases on
Windows; one actual POSIX signal case is reserved for Linux CI. Final evidence
is written without yielding to an interleaving signal callback.

## Lint Gate Resolution

The lint dependency gate was subsequently resolved by PR #75 commit
`39867c86a7e9ec2c47d550c937e0ff67d696a3e4`, now included in this candidate.
The registry fast-glob/micromatch/braces path was removed and replaced by a
dependency-free, explicit-directory lookup scoped to the exact Next consumer.
No lint rule or audit threshold was disabled. Full root and frontend audits
report zero vulnerabilities; 43 local lint regression cases and ordinary lint
passed. The toolchain commit's [functional CI](https://github.com/R3NiRN1/tesla-crowdfund/actions/runs/39695711200)
and [all five security jobs](https://github.com/R3NiRN1/tesla-crowdfund/actions/runs/39695711010)
passed, including the default Linux frontend build and full dependency audit.

See [the repair contract](LINT_DEPENDENCY_REPAIR.md) for explicit-root-only
configuration, effective-config guards and a separately documented pre-existing
nested App Router navigation-lint limitation. Require fresh checks on this
dependent candidate as well. This resolves the dependency blocker, not the
thirteen independent human review threads, browser-wallet acceptance, test-host
configuration or live BSC rehearsal. Decision remains LOCAL_ONLY.

## Initial Review Record

## Candidate and fixes

The review started from PR #75 commit
`ba4445d5e42dd0526f460b603a42f3389444467b`, stacked on PR #74 commit
`9a6dcba887a553f42142ddbf4f52c177564a7662`. `dev` is
`aaf14c107f3bc9349aca6ce153a3bb9e4fde7760`. The fixes and this report are
committed on the existing PR #75 branch; use its resulting commit as the next
candidate, and require checks on that commit before approval.

Repairs made during this review:

- Publication verification passed a positional transaction hash to Viem methods
  requiring `{ hash }`. The regression was reproduced before repair. Strict fixture
  arguments, real Viem transport checks and a mined local-chain publication now
  exercise this boundary. CI includes the local-chain check after deploy/smoke.
- Provider errors could expose backend RPC URLs and their credentials through API
  error responses. All provider failures are converted to safe structured errors;
  regression checks inject credential-bearing errors at every RPC stage.
- Insufficient-confirmation errors included a `BigInt` block number that could not
  be JSON-encoded by the HTTP error handler. The reproduced failure is fixed by
  returning the block number as a decimal string. Negative publication checks now
  require JSON-safe error payloads.
- Next.js and matching ESLint configuration moved from 16.3.3 to 16.3.8. Fresh
  advisories affected the previous version, including critical
  [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j).
  This is dependency exposure evidence, not proof that this app used the vulnerable
  ImageResponse feature.
- npm-generated compatible updates patched `adm-zip`, `follow-redirects`,
  `brace-expansion`, `sharp` and `source-map-js`. No forced downgrade, audit
  exclusion or invented lockfile integrity was used. npm 11 also pruned obsolete
  extraneous/optional peer entries from the frontend lockfile.
- The injected-wallet connector uses its dedicated public entry point instead of
  importing the barrel containing unused optional wallet SDKs.

## Verification

Host: Windows, Node 24.20.0, npm 11.19.0. Locked clean installations succeeded at
root and frontend. Tests use temporary stores and local mock assets.

| Check | Result |
| --- | --- |
| `npm run backend:check` | All seven suites passed, including auth, ownership, operator roles, persistence, publication and proxy checks |
| `npm run compile` | Passed; exact solc 0.8.20, Paris EVM |
| `npm run test:contracts` | All 18 tests passed, including cap, refunds, milestone ordering, dispute and timeout paths |
| Root `tsc --noEmit` | Passed |
| `npm --prefix frontend run lint` | Passed |
| Default frontend production build | Failed on this Windows host: Turbopack CSS worker exited before connecting; repeated outside the sandbox |
| Frontend production build with `--webpack` | Passed; supported diagnostic alternative, not a replacement for the default CI gate |
| `npm run preflight` | Passed only in setup mode; missing deployment and production configuration remain warnings |
| `npm run launch:rehearsal` | Local document/store gate passed; no live testnet claim |
| `npm run launch:rehearsal -- --live-testnet` | Failed as expected for the unconfigured environment described below |
| Local V2 deploy, smoke and `node scripts/check-publication-local.mjs` | Passed on chain 31337 with MockTES and a real mined publication |
| Root dependency audit | Zero vulnerabilities |
| Frontend runtime audit (`--omit=dev`) | Zero vulnerabilities |
| Full frontend dependency audit | Failed: five High dependency nodes from one unpatched `braces` advisory |
| Local PostgreSQL integration / live BSC rehearsal | Not run: no dedicated database or configured testnet deployment |

The initial sandbox denied a temporary-store rename and loopback access. Backend
and local-chain checks were repeated outside that sandbox and passed. No BSC
testnet or mainnet transaction was sent.

## Open gates

1. The lint dependency path `eslint-config-next -> @next/eslint-plugin-next ->
   fast-glob -> micromatch -> braces` still fails the existing High threshold.
   [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
   has no patched release at review time. Do not use npm's proposed forced
   downgrade to Next 14, disable the gate or silently accept the risk. A compatible
   upstream repair or an explicitly reviewed toolchain change is required.
2. Require current candidate CI, including the added real-RPC publication check.
   Prior PR #75 CI passed, but its Security Gates workflow failed Dependency
   Review because Dependency Graph was disabled. Verify repository settings and
   obtain a passing current check; historical green jobs are insufficient.
3. PR #74 still has thirteen unresolved security review threads. Their triage
   record is in `docs/security/STATIC_ANALYSIS_TRIAGE.md`; human disposition and
   the required branch protection checks remain part of candidate integration.
4. Resolve the default Windows Turbopack build failure or explicitly validate the
   intended testing host and record its default production build evidence. The
   successful Webpack diagnostic alone does not prove that failure is repaired.
5. Configure a dedicated PostgreSQL test database, frontend/backend URLs, exact
   CORS origin, chain-97 RPC, fresh V2 factory, MockTES token, arbitrator and named
   review operator. The current environment has zero factory/token addresses,
   no frontend backend URL, no BSC deployment RPC, and no database/CORS setup.

## Test launch handoff

After those gates pass, integrate the stacked PRs in dependency order through
reviewed PRs into `dev`. Delete only branches whose work is confirmed merged,
fetch/prune, and fast-forward local `dev`. Preserve `main` and unmerged work.

Follow `docs/BSC_TESTNET_RUNBOOK.md`, `docs/BACKEND_PERSISTENCE.md` and
`docs/OPERATOR_AUTH.md` for V2 setup. The older launch-loop documents are useful
historical context; their alpha admin-token and file-store instructions are not
the production-like V2 operator/persistence setup.

Use six distinct testnet-only wallets and MockTES on chain 97. Inject secrets
through an untracked operator environment. Apply migrations, provision the named
operator, and verify `/health`, operator diagnostics and independent publication
trust anchors before inviting testers. Record the exact commit, deployment
manifest, factory/token/arbitrator addresses, transaction links and recovery owner.

Start with creator authentication, draft, needs-changes, approval, creator-wallet
publication, public listing, backer contribution and exact-cap scenarios. Continue
the resumable harness phases for funding expiry, sequential review/release,
challenge, arbitration approval/rejection/timeout, creator inactivity and refunds.
The immutable 7/14/30-day windows require a real multi-week soak; record unfinished
phases as pending. Retain backend audit and backup/restore evidence with the run.

This report permits no mainnet release. Actual TES token compatibility,
independent contract review and explicit mainnet authorization remain separate
release requirements.
