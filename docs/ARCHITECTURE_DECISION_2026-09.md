# Architecture decision: Hardhat 3 and Viem

Date: 2026-09-11  
Status: implementation candidate; remote CI and human review pending
Scope: root contract, deployment, test and backend chain-interaction toolchain

## Decision

Migrate the active root toolchain from Hardhat 2 and Ethers 5 to Hardhat 3 and
Viem. Use Hardhat's Node test runner so the selected root dependency tree can
meet the existing no-High audit gate.

The frontend already uses Viem through Wagmi. Using the official Hardhat Viem
plugin permits one ABI and numeric model across contract tests, deployment
scripts, backend publication verification and the browser application. Ethers is
removed rather than retained as a second EVM client.

This is a controlled toolchain change, not a contract upgrade. No Solidity
source, funding economics, timing window, arbitrator authority, token policy or
deployment address may change as part of the spike.

## Drivers

- The exact-head root dependency audit reports seven High findings in the
  Hardhat 2 / Ethers 5 dependency tree and offers no compatible non-forced fix.
- Hardhat 3 is the supported major line and requires Node.js 22.13 or later.
- The frontend already uses Viem, so an Ethers 6 migration would preserve two
  overlapping EVM libraries and two numeric/API models.
- The official Hardhat Viem plugin provides public, wallet and test clients plus
  typed deployed-contract access.
- A trial retaining Mocha 11 left a High `serialize-javascript` advisory. The
  Node test runner avoids that dependency rather than suppressing the audit.

## Rejected alternatives

### Remain on Hardhat 2 / Ethers 5

Rejected because the root security gate remains blocked and the dependencies
are not a defensible future baseline.

### Hardhat 3 / Ethers 6

Viable fallback only if the Viem spike exposes a verified blocker. It would be
a smaller syntactic change for some scripts, but would retain a duplicate chain
client beside the frontend's Viem stack.

### Replace Hardhat with Foundry

Not selected for this migration. A simultaneous language, test-framework and
deployment-tool rewrite would make behavioural comparison harder. Solidity
invariant/fuzz tooling can be evaluated separately after the dependency gate is
closed.

## Reproducible compiler policy

The spike retains Solidity 0.8.20 exactly and resolves the npm-installed
`solc/soljson.js` path explicitly. This prevents an unavailable compiler mirror
from silently changing or blocking the build. The old compiler package pins
`tmp@0.0.33`; npm narrowly overrides only that child dependency to patched
`tmp@0.2.7`. Compilation and bytecode comparison must prove compatibility.

Hardhat 3 otherwise selected a newer EVM target and changed every deployed
artifact. The migration therefore pins `evmVersion: "paris"`, matching the
pre-migration Hardhat 2 build. At code commit
`a2762956b7cb78894b5a19ea59114f833073a1b9`, all six deployed artifacts have
the same size and the same bytecode as PR #74 commit
`9a6dcba887a553f42142ddbf4f52c177564a7662` after normalising only Solidity's
embedded IPFS metadata hashes. The factory comparison normalises both its own
metadata and the embedded campaign-creation metadata. No other byte differs.

`npm run compare:bytecode` makes this check reproducible when
`BYTECODE_BASELINE_ARTIFACTS` points to the baseline `artifacts/contracts`
directory. It also fails if an artifact exceeds the EIP-170 24,576-byte limit.

## Acceptance evidence required

- Clean root installation on a supported Node.js release.
- No Solidity behavioural changes.
- Complete contract suite passes with unchanged economic assertions.
- Backend auth and independent publication-verification suites pass.
- V2 local deployment and smoke rehearsal passes.
- Release preflight passes.
- Root audit has no High or Critical findings.
- Frontend clean install, audit, lint and production build remain green.
- Contract deployed-bytecode sizes are checked against the pre-migration
  baseline and remain within normal EVM limits.
- No test, scanner, audit threshold or release guardrail is weakened.

## Local acceptance snapshot

At code commit `a2762956b7cb78894b5a19ea59114f833073a1b9` on Node
`24.19.0` and npm `11.9.0`:

- a clean Hardhat 3 compile used exact solc `0.8.20` and EVM target `paris`;
- all 18 contract tests passed under the Hardhat Node test runner;
- all seven backend auth, persistence, operator, publication, route-security,
  and proxy checks passed;
- TypeScript validation of the root configuration and active scripts passed;
- the chain-97 harness refused local chain 31337 before any transaction;
- the V2 deploy and smoke scripts passed together on a persistent local chain
  31337, including identity, code, token-accounting and version assertions;
- release preflight passed with the documented CI setup-mode environment;
- a clean frontend install reported zero vulnerabilities, and frontend lint,
  TypeScript production validation and the Next.js production build passed;
- root `npm audit --audit-level=high` passed its High/Critical threshold and
  reported only three Moderate findings through Hardhat's `adm-zip` dependency;
- npm offers only a forced Hardhat downgrade for those Moderate findings, so no
  forced fix or risk acceptance was applied; and
- the bytecode compatibility result is recorded above.

On draft PR #75 predecessor head
`609b35c517984a79b20b7d13d5c32f34f3a512fa`, all five CI jobs, Slither,
CodeQL, history secret scanning, and the High/Critical dependency audit passed.
Dependency Review failed only because the repository Dependency Graph is
disabled. The subsequent aggregate `CI` job must pass at the resulting exact
head before the ruleset mapping can be treated as verified.

Failure of any criterion keeps this branch an unmerged spike. Mainnet and BSC
testnet transactions remain outside this decision.
