# Tesla Crowdfund Security Repair Brief — 2026-08

Status: **P0 remediation in progress**

Target branch: `security/p0-remediation-2026-08`
Base branch: `dev`

## Objective

Move the repository from a useful BSC crowdfunding alpha to a defensible pre-production release candidate by repairing known fund-accounting and authorization defects, expanding adversarial tests, updating vulnerable dependencies, and adding explicit release gates.

This brief does **not** authorize a mainnet deployment. Existing deployed contracts are immutable and must not be treated as upgraded by changes in this repository.

## Confirmed P0/P1 defects

### P0 — Excess contributions can become unreachable

`Campaign.contribute()` accepts contributions after the campaign has already reached its funding goal and does not cap the accepted amount to the remaining goal. Milestone payouts are constrained to the milestone schedule, whose constructor total equals `goal`. There is no excess-withdrawal or excess-refund path.

Required repair: define the funding policy explicitly. Default repair assumption is a **hard funding cap** and rejection of contributions that exceed the remaining amount.

Acceptance criteria:
- No valid call sequence can leave legitimate contributed tokens permanently unreachable.
- Tests cover exact-goal contribution, one-unit-under, one-unit-over, repeated contributions, and multi-backer boundary conditions.

### P0 — Goal mutation breaks the milestone invariant

The constructor requires `sum(milestoneAmounts) == goal`, while `updateGoal()` changes `goal` without changing milestone amounts.

Required repair: remove `updateGoal()` from the production contract unless a complete invariant-preserving redesign is approved.

Acceptance criteria:
- `goal` and the aggregate milestone schedule cannot diverge after construction.
- Contract tests assert the invariant across all externally callable state transitions.

### P0 — Refund accounting can diverge from escrowed funds

`refund()` clears the backer's contribution and transfers funds but does not reduce `totalContributed`. Combined with deadline extension and later contributions, historical contributions can be counted after funds have left escrow.

Required repair:
- Separate or redefine accounting so the goal decision uses funds still legitimately committed to the campaign.
- Prevent lifecycle transitions that allow a failed/refunding campaign to resume funding unless an explicitly designed state machine supports that behavior.

Acceptance criteria:
- After refunds, accounting matches the economic state of escrow.
- No sequence of expire/refund/extend/contribute can cause a false goal-met state.

### P0 — Milestone payouts are not actually milestone-gated

Once `totalContributed >= goal`, the owner can claim any unclaimed milestone immediately and in any order. The current contract provides staged labels, not staged escrow controls.

Required repair: implement the agreed milestone release model. Until that model is approved, no mainnet-capable contract should imply that milestones protect backers.

Decision required:
- platform/admin approval;
- backer approval;
- time-locked creator release;
- another explicitly specified mechanism.

Acceptance criteria:
- Milestone release conditions are enforced on-chain.
- Tests prove milestones cannot be released before their gate and cannot be double-claimed.
- Ordering policy is explicit and tested.

### P0 — Creator backend writes are not cryptographically authorized

Wallet signature verification exists, but creator mutations do not consume an authenticated session or an action-bound signature. Address strings supplied in request bodies are therefore identity claims rather than proof of wallet control.

Required repair:
- Issue a short-lived authenticated creator session after wallet signature verification, or require action-bound signed requests.
- Bind creator-only operations to the authenticated wallet.
- Enforce authorization on create/update/submit/publish/update operations where creator identity matters.

Acceptance criteria:
- A caller who knows another creator address cannot mutate that creator's data.
- Authentication expires and is revocable/invalidatable.
- Replay tests fail.
- Authorization tests cover every creator mutation endpoint.

### P0 — Publication records are not independently verified on-chain

The backend checks address/hash syntax and matching supplied strings, but does not verify the transaction receipt, factory event, deployed campaign, creator ownership, metadata URI, factory address, or expected chain.

Required repair:
- Resolve the transaction receipt through a configured RPC.
- Verify success, chain, approved factory, factory event, campaign address, creator, token/factory relationship, and metadata URI.
- Reject publish records that cannot be independently reconstructed from chain evidence.

Acceptance criteria:
- Fabricated but well-formed transaction hashes are rejected.
- A transaction from the wrong factory, creator, chain, or metadata URI is rejected.
- Publication becomes a recorded observation of chain state rather than a caller assertion.

### P0 — Frontend dependency contains published security vulnerabilities

The lockfile pins Next.js 16.2.9. This version is below current patched 16.x releases and is within published affected ranges for 2026 Next.js advisories.

Required repair:
- Upgrade Next.js and matching `eslint-config-next` to a currently patched release.
- Regenerate `frontend/package-lock.json` using npm; do not hand-edit integrity hashes.
- Run lint and production build after lock regeneration.

Acceptance criteria:
- `npm ci` succeeds from a clean checkout.
- `npm audit`/advisory review contains no known critical vulnerability attributable to the selected Next.js version.
- CI records the exact resolved version.

### P1 — Public backend data exposure

`GET /submissions` and `GET /audit` expose draft/moderation/audit information without authorization.

Required repair: classify public vs operator-only data and require appropriate authorization for non-public collections.

### P1 — Rate limiting trusts unvalidated forwarded IP data

The backend uses the first `x-forwarded-for` value as the client identity without a trusted-proxy policy.

Required repair: use the socket address by default; only trust forwarded headers when an explicit proxy deployment mode is configured.

### P1 — Nonce supersession permits authentication disruption

Unauthenticated nonce issuance invalidates an existing unused nonce for the same wallet.

Required repair: stop unsolicited nonce requests from invalidating unrelated pending challenges, or otherwise make the supersession policy resistant to trivial denial of service.

## Contract V2 strategy

The existing contracts are not proxy-upgradeable. The repair therefore uses a **new deployment version**, not an in-place upgrade.

Proposed structure:
- retain current contracts as historical V1 source;
- introduce corrected V2 contract/factory names or an explicit version field/event;
- make frontend/backend configuration version-aware;
- never silently treat a V1 address as V2;
- document any known V1 testnet/mainnet deployments and their limitations.

No mainnet V2 deployment is authorized by this brief.

## Implementation sequence

### Phase 1 — Characterisation and security baseline
1. Add tests that reproduce each confirmed contract defect.
2. Add backend authorization tests that demonstrate current impersonation paths.
3. Record current expected failures before repair.
4. Upgrade the vulnerable frontend dependency with a regenerated lockfile.

### Phase 2 — Contract V2
1. Implement the approved funding cap policy.
2. Remove or redesign goal mutation.
3. Implement an explicit campaign lifecycle/state machine.
4. Correct contribution/refund accounting.
5. Implement the approved milestone release gate.
6. Add invariant and sequence tests.

### Phase 3 — Backend identity and provenance
1. Convert wallet verification into enforceable short-lived authorization.
2. Protect creator mutations.
3. Protect operator-only reads/writes.
4. Verify publication receipts and factory events over RPC.
5. Harden proxy/rate-limit handling.

### Phase 4 — Integration
1. Update frontend contract ABI/version handling.
2. Update creator authentication UX.
3. Update publish flow to wait for chain verification.
4. Run complete testnet happy-path and adversarial paths.

### Phase 5 — Release gate
A release candidate must not be marked mainnet-ready unless all of the following are true:
- clean `npm ci` at root and frontend;
- Solidity compile succeeds;
- comprehensive contract tests pass;
- backend security/authorization tests pass;
- frontend lint and production build pass;
- current dependency advisory review passes;
- no P0 issue remains open;
- independent smart-contract review has been completed;
- testnet soak testing has exercised contribution, cap, refund, milestone, publication verification, moderation, and recovery paths;
- deployed bytecode/source/version addresses are recorded;
- mainnet deployment still requires a separate explicit human approval.

## Decisions awaiting product owner answer

1. Funding policy: **hard cap at goal** (recommended) vs overfunding.
2. Milestone release authority/mechanism.
3. Whether campaigns may ever extend their deadline after first contribution or expiry (recommended: no).
4. Whether milestones must be sequential (recommended: yes unless a concrete use case requires otherwise).
5. Confirmation that corrected contracts ship as V2 and existing deployments remain unchanged.

## Change-control rules for this remediation

- Work only on the remediation branch until reviewed.
- Use a draft pull request until policy decisions are resolved and CI is green.
- Do not weaken tests to obtain a green build.
- Do not manually invent lockfile integrity values.
- Do not merge or deploy to mainnet automatically.
- Every security-relevant assumption must be visible in code, tests, or documentation.
