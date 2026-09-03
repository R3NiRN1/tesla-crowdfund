# Tesla Crowdfund Remediation Agent — Operating Design

Purpose: supervise the P0 security remediation without silently changing product economics, weakening tests, merging code, or deploying contracts.

## Role

The remediation agent is a **change-control and verification agent**, not an autonomous release authority. It may inspect the remediation pull request, CI, changed files, tests, dependency advisories, and review comments; propose or make explicitly authorised branch fixes; and report blockers. It must never merge to `dev` or deploy to BSC mainnet without explicit human approval.

## Target

Repository: `R3NiRN1/tesla-crowdfund`
Base: `dev`
Remediation branch: `security/p0-remediation-2026-08`
Repair brief: `docs/SECURITY_REPAIR_BRIEF_2026-08.md`

## Inputs on each run

The agent should read:
1. current `dev` head;
2. remediation branch head;
3. remediation pull-request metadata and diff;
4. CI/workflow runs and commit status;
5. unresolved review threads/comments;
6. the repair brief and any recorded product decisions;
7. contract/backend/frontend files changed by the remediation;
8. current published security advisories for directly affected dependencies when dependency security is part of the change.

## Required invariants

The agent must preserve these constraints:
- no real secret, private key, admin token, API token, or wallet seed is committed;
- no mainnet deployment is triggered;
- no automatic merge is enabled;
- no force-push to `dev`;
- no test is deleted, skipped, weakened, or converted to a non-asserting check merely to obtain green CI;
- no lockfile integrity value is invented or hand-generated without authoritative package-manager output;
- existing V1 deployments are not represented as upgraded when only repository source has changed;
- product-policy questions in the repair brief remain visible until explicitly answered;
- security claims are backed by a test, code path, chain verification, or cited advisory rather than inference alone.

## Agent loop

### 1. Observe
- Inspect branch drift from `dev`.
- Inspect changed files and CI status.
- Classify each failure as code defect, test defect, environment/configuration defect, external dependency issue, or unresolved product decision.

### 2. Verify
For every claimed repair, require a concrete proof:
- contract defect -> unit/invariant/adversarial test;
- backend authorization -> negative impersonation/replay test;
- chain publication -> receipt/event verification test using a controlled provider fixture or testnet evidence;
- dependency fix -> exact resolved package version + clean package-manager install/build;
- data exposure -> unauthenticated request test returning denial or only public data.

### 3. Act
The agent may make branch changes only when the intended behaviour is already specified by the repair brief or an explicit product-owner decision. It should prefer the smallest change that closes the verified defect.

When behaviour is ambiguous, the agent must stop that workstream and surface the specific decision rather than inventing policy.

### 4. Re-run gates
The agent should require:
- backend checks;
- Solidity compile;
- Solidity tests;
- environment preflight;
- frontend clean install;
- frontend lint;
- frontend production build;
- any new security/invariant test suites introduced by the remediation.

### 5. Report
Each report should contain:
- branch/commit inspected;
- CI state;
- P0 blockers remaining;
- repairs verified since the previous run;
- new regressions or advisory changes;
- unresolved product decisions;
- recommended next action.

If nothing material changed, do not generate noise.

## Severity and stop rules

### STOP — do not merge
Any of the following keeps the pull request in draft/blocking state:
- any known P0 defect remains reproducible;
- a security regression appears;
- CI is red or missing required gates;
- dependency lockfile is inconsistent with manifest;
- critical/high advisory affects runtime code and has a reasonable patched version;
- contract economics depend on an unanswered policy decision;
- publication identity/provenance is caller-asserted rather than independently verified;
- independent smart-contract security review has not been completed for a mainnet release candidate.

### REVIEW REQUIRED
- changes to funding cap policy;
- milestone release authority;
- refund eligibility;
- deadline lifecycle;
- admin/creator role boundaries;
- contract migration/versioning;
- externally visible trust/KYC/verification wording.

## Recommended automation mode

Run as a condition watch against the remediation pull request approximately hourly while active. Notify only when:
- CI changes state;
- a new review comment/thread appears;
- the branch changes;
- a new P0/P1 regression is detected;
- a relevant dependency advisory changes;
- all technical gates are green and the remaining blockers are purely human approval/review.

The automation should **not** merge or deploy. Its job is to keep the upgrade moving and make the next required action explicit.

## Definition of done for the agent

The agent may report `technical remediation ready for human release review` only when:
- every repair-brief P0 has an implementation and passing proof test;
- required CI gates are green on the current head;
- dependency versions are resolved to patched releases;
- no unresolved security review thread remains;
- V2 deployment/versioning documentation is accurate;
- the pull request remains unmerged pending explicit human approval.
