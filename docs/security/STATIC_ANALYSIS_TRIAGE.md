# Static-analysis and dependency triage

This record separates scanner evidence from security conclusions. Automated findings
must be reviewed against the exact source and release commit. A green scanner is not
an audit, penetration test, or mainnet release approval.

## Enforcement policy

- CI fails on new high or critical dependency advisories and on high-severity Slither findings.
- Secret scanning covers the complete reachable Git history, not only the current diff.
- No finding may be excluded merely to make CI pass.
- A false-positive disposition requires a source-specific explanation and reproducible evidence.
- An accepted risk requires a named human owner, an expiry/review date, and explicit release-gate approval.
- Scanner allowlists must be narrow (rule, exact path and exact fixture where possible) and reviewed like code.
- The SARIF file and its digest belong to the release evidence bundle.

## Pinned tools

| Tool | Pinned release | CI action commit | Purpose |
| --- | --- | --- | --- |
| Slither | `0.11.6` | `crytic/slither-action@b52cc1cbfee9ca3e8722dd5224299d16c9a6b80f` (`v0.4.2`) | Solidity static analysis; High findings fail CI |
| Gitleaks | action `v3` | `gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` | Current-tree and history secret scan |
| GitHub Dependency Review | `v4.9.0` | `actions/dependency-review-action@2031cfc080254a8a887f58cffee85186f0e49e48` | Reject newly introduced High/Critical advisories |
| CodeQL | `v4.37.9` | `github/codeql-action@cdf488f595d80d6e07e03d4674febd5ab45fa938` | JavaScript/TypeScript static analysis and SARIF ingestion |
| npm audit | npm bundled with Node `24` in CI | n/a | Whole root and frontend lockfile advisory gate |

Actions are pinned to full commits. Updating a pin requires review of the upstream
release and the new commit, followed by a clean CI run.

## Current dependency triage

The remediation changed the frontend dependency line from Next.js `16.2.9` to
`16.3.3`. The regenerated lockfile also moved security-relevant transitive packages,
including Nano ID to `3.3.18` and PostCSS to `8.5.23`.

| Advisory | Severity | Selected version evidence | Disposition |
| --- | --- | --- | --- |
| `GHSA-2xp9-vwfh-vxw4` (Next.js AVIF image optimisation RCE) | Critical | Next.js `16.3.3` is the maintainer-declared patched version | Fixed by selected direct dependency; retain audit gate |
| `GHSA-p293-qw3h-jr36` (Next.js Windows-hosted server RCE) | Critical | Next.js `16.3.3` is the maintainer-declared patched version | Fixed by selected direct dependency; retain audit gate |
| `GHSA-2v37-7h3g-55p8` (Nano ID zero-size loop) | High | Nano ID `3.3.18` is the patched 3.x floor | Fixed transitively; retain exact lockfile evidence |
| `GHSA-r28c-9q8g-f849` (PostCSS source-map path traversal) | High | PostCSS `8.5.23` is above the `8.5.18` fixed floor | Fixed transitively |
| `GHSA-fxqj-rqcc-2cmp` (PostCSS incomplete follow-up) | Moderate | PostCSS `8.5.23` is the patched floor | Fixed transitively |

This targeted review is not a substitute for scanning the complete lock trees. The
release gate requires fresh root and frontend `npm audit --audit-level=high` results
and a passing Dependency Review check at the exact final commit.

## Finding register

The entries below are tied to exact-head evidence. A disposition is not a release-risk
acceptance, and unresolved review threads remain for human review.

| Date | Release commit | Tool/rule or advisory | Severity | Source location/dependency path | Disposition | Evidence and owner | Review/expiry |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-08 | `4135489a299d3a5f640570703db3452eec33438d` | Slither `incorrect-exp` | High | `node_modules/@openzeppelin/contracts/utils/math/Math.sol:257` | False positive in third-party OpenZeppelin 5.4.0 code. Solidity `^` is intentional XOR used to seed the modular inverse in `mulDiv`; the adjacent source documents the Newton-Raphson/Hensel-lifting algorithm. The exact vendor file is filtered; no detector or dependency tree is excluded. | Security Gates run 12, job `Solidity static analysis`, passed; source inspection. This is a false-positive disposition, not a release-risk acceptance. | Re-review whenever OpenZeppelin or Slither changes. |
| 2026-09-08 | `4135489a299d3a5f640570703db3452eec33438d` | Slither `divide-before-multiply` | Medium | `contracts/CampaignV2.sol:500-504` | Replaced with full-precision `Math.mulDiv(..., Math.Rounding.Ceil)` without changing the approved 10% threshold. Boundary tests cover zero-before-funding, `1`, `BPS-1`, `BPS`, `BPS+1`, and `type(uint256).max`. | CI run 380 contract job and Security Gates run 12 Slither job passed. GitHub marked the review thread resolved after the changed analysis. | Re-run Slither and contract tests after any relevant change. |
| 2026-09-08 | `4135489a299d3a5f640570703db3452eec33438d` | Slither `uninitialized-local` | Medium | `contracts/CampaignV2.sol:185` | Solidity integer locals are zero-initialised, so no exploitable defect was present; changed to explicit `= 0` for unambiguous scanner evidence. Historical V1 remains unchanged. | CI run 380 contract job and Security Gates run 12 Slither job passed. GitHub marked the review thread resolved after the changed analysis. | Re-run Slither after any relevant change. |
| 2026-09-08 | `4135489a299d3a5f640570703db3452eec33438d` | Slither `incorrect-equality` | Medium | `contracts/CampaignV2.sol:484` | False positive. `amount == 0` is an internal zero-transfer guard, not a balance, price, timestamp, or authorization comparison. Zero refund shares must remain no-op safe under integer rounding. | Exact source plus refund-pool conservation tests. This is a false-positive disposition, not a release-risk acceptance. | Human review thread remains unresolved; re-review if `_safeExactTransfer` inputs or refund rounding change. |
| 2026-09-08 | `4135489a299d3a5f640570703db3452eec33438d` | Slither `timestamp` | Low | `contracts/CampaignV2.sol` deadline/review/dispute/submission comparisons | Intended protocol mechanism. Timestamp comparisons enforce immutable 7-day, 14-day, and 30-day windows; normal miner/validator timestamp latitude is not material to those durations. | Exact source, adversarial deadline tests, and `BSC_TESTNET_RUNBOOK.md`. | Eleven human timestamp threads remain unresolved; independent contract reviewer must confirm before mainnet. |
| 2026-09-08 | `4135489a299d3a5f640570703db3452eec33438d` | CodeQL `DOM text reinterpreted as HTML` | Severity not exposed in PR thread | `frontend/app/page.tsx:52` | Unresolved review thread. JSX renders `short(address)` as a React text child; no HTML parser or `dangerouslySetInnerHTML` sink is invoked. Explorer URL validation remains a separate URL-scheme concern. | Security Gates run 12 CodeQL job passed, but the GitHub Advanced Security CodeQL check/review thread must be treated separately. | Human security-thread review required; do not auto-resolve. |
| 2026-09-08 | `6060b65cd7f7167a7a5cdb71af9a8fed4d674e67` | npm audit `GHSA-c83g-rgw3-j3cx`, `GHSA-73wf-gq98-2v4g`, `GHSA-p498-v437-472g` | High / Moderate | `eslint-config-next -> eslint-plugin-react-hooks -> @babel/core -> @babel/helper-compilation-targets -> browserslist`; `eslint -> @humanfs/node` | Fixed with npm-generated compatible lockfile updates: Browserslist 4.28.9 and `@humanfs/node` 0.16.8. | Clean npm 10.8.2 install, zero-vulnerability frontend audit, lint, TypeScript, and production build. | Retain the audit gate. |
| 2026-09-08 | `4135489a299d3a5f640570703db3452eec33438d` | Root npm audit | 7 High, 4 Moderate, 16 Low | Hardhat 2 / ethers 5 build, deployment, and test toolchain | Open blocker. A non-forced audit fix proposes zero compatible changes. Do not force overrides or combine a Hardhat/ethers migration with unrelated remediation. | Security Gates run 12 dependency-audit job failed; no human acceptance recorded. | Separate controlled toolchain decision required. |
| 2026-09-11 | `a2762956b7cb78894b5a19ea59114f833073a1b9` | Root npm audit / `GHSA-vwc7-r8mq-g2x9` | Moderate | Hardhat 3 -> `adm-zip` | The isolated Hardhat 3 / Viem candidate removes all root High/Critical findings. Three Moderate findings remain on this one dependency path. npm offers only `audit fix --force`, which would downgrade Hardhat; no forced change or acceptance was applied. | Local Node 24.19.0/npm 11.9.0 `npm audit --audit-level=high` exited 0; GitHub-hosted audit is still required at the published commit. | Track upstream Hardhat/`adm-zip`; re-review on either dependency update and before release. |

## Exact-head gate snapshot

Status at `4135489a299d3a5f640570703db3452eec33438d`:
**STOP — CODE/SECURITY BLOCKERS REMAIN**.

- CI run 380 passed all five jobs, including PostgreSQL migration/integration checks,
  contract compilation/tests, release preflight, deployment smoke rehearsal, and the
  frontend lint/build job.
- Security Gates run 12 passed Slither, CodeQL, and full-history secret scanning.
- The root dependency audit failed on the open Hardhat 2 / ethers 5 toolchain findings.
- Dependency Review failed because repository Dependency Graph is disabled.
- Thirteen review threads remain unresolved: one CodeQL, one Slither strict-equality,
  and eleven Slither timestamp threads. Two fixed Slither threads were marked resolved
  by GitHub's updated analysis; no thread was manually resolved by the remediation agent.

## Isolated migration candidate snapshot

Local evidence at code commit `a2762956b7cb78894b5a19ea59114f833073a1b9`
shows no High/Critical root dependency finding, 18 passing contract tests, all
backend checks passing, and deployed-bytecode equivalence to PR #74 commit
`9a6dcba887a553f42142ddbf4f52c177564a7662` after normalising only Solidity
IPFS metadata hashes. This is not an exact-head GitHub gate result. The candidate
The clean frontend audit/lint/build and local chain-31337 V2 deploy/smoke criteria
also passed without sending a BSC transaction. The candidate remains stopped
pending publication to an isolated stacked branch, GitHub-hosted CI/security
runs, Dependency Graph enablement, and human disposition of the 13 unresolved
review threads.

## Narrow vendor finding filter

`slither.config.json` filters only the exact third-party file
`node_modules/@openzeppelin/contracts/utils/math/Math.sol`. This prevents the verified
`incorrect-exp` false positive from failing the High-severity gate while leaving all
project contracts, V1, other OpenZeppelin files, and every Slither detector enabled.
The filter must not be broadened without a new source-specific review.

Pre-publish verification used Slither `0.11.6` over the working tree based on
`6060b65cd7f7167a7a5cdb71af9a8fed4d674e67`, with the contract, test, and filter
changes recorded above. The exact command was
`/tmp/tes-slither-0116/bin/slither . --fail-high --sarif /tmp/tes-slither-static.sarif`;
it exited `0`, and the SARIF SHA-256 was
`7322cd07ceab83a8a36e10bf774633794d87fc6a693b3c49f05547bc91ab130e`.
The GitHub Actions SARIF and digest at the published commit remain required release
evidence.

For every run, record the exact command, tool version, SARIF/report digest, and whether
the scan covered the working tree, the pull-request diff, or Git history.
