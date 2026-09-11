# Architecture decision: Hardhat 3 and Viem

Date: 2026-09-11  
Status: implementation spike  
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

Failure of any criterion keeps this branch an unmerged spike. Mainnet and BSC
testnet transactions remain outside this decision.
