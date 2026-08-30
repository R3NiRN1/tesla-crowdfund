# Tesla Crowdfund Security Repair Brief — 2026-08

Status: **P0 remediation in progress**

Target branch: `security/p0-remediation-2026-08`
Base branch: `dev`

## Objective

Move the repository from a useful BSC crowdfunding alpha to a defensible pre-production release candidate by repairing known fund-accounting and authorization defects, expanding adversarial tests, updating vulnerable dependencies, and adding explicit release gates.

The project objective is also to establish meaningful TES utility through Teslastarter crowdfunding while keeping the audited escrow layer compatible with other suitable BSC ERC-20/BEP-20 tokens.

This brief does **not** authorize a mainnet deployment. Existing deployed contracts are immutable and must not be treated as upgraded by changes in this repository.

## Confirmed P0/P1 defects

### P0 — Excess contributions can become unreachable

V1 `Campaign.contribute()` accepts contributions after the campaign has already reached its funding goal and does not cap the accepted amount to the remaining goal. Milestone payouts are constrained to the milestone schedule, whose constructor total equals `goal`. There is no excess-withdrawal or excess-refund path.

**Approved V2 repair:** hard-cap funding exactly at `goal`. If a requested final contribution exceeds the remaining capacity, transfer only the remaining amount; excess stays in the contributor wallet and never enters escrow.

Acceptance criteria:
- `totalContributed` can never exceed `goal`.
- No valid contribution call sequence can leave legitimate contributed tokens permanently unreachable.
- Tests cover exact-goal contribution, one-unit-under, one-unit-over, repeated contributions, and multi-backer boundary conditions.

### P0 — Goal mutation breaks the milestone invariant

The V1 constructor requires `sum(milestoneAmounts) == goal`, while `updateGoal()` changes `goal` without changing milestone amounts.

**Approved V2 repair:** `goal` is immutable. V2 has no `updateGoal()` production path.

Acceptance criteria:
- `goal` and the aggregate milestone schedule cannot diverge after construction.
- Contract tests assert the invariant across all externally callable state transitions.

### P0 — Refund accounting can diverge from escrowed funds

V1 `refund()` clears the backer's contribution and transfers funds but does not reduce `totalContributed`. Combined with deadline extension and later contributions, historical contributions can be counted after funds have left escrow.

**Approved V2 repair:** immutable funding deadline plus an explicit terminal refund state. A failed campaign cannot resume funding. Gross accepted contribution weight may remain available for deterministic pro-rata refund accounting, but it can never be reused to satisfy the funding goal after funds have left escrow.

Acceptance criteria:
- After refunds, accounting matches the economic state of escrow.
- No expire/refund/extend/contribute sequence can revive a failed campaign.
- All unreleased escrow remains attributable to backers when a milestone fails.

### P0 — Milestone payouts are not actually milestone-gated

V1 lets the owner claim any unclaimed milestone immediately and in any order once the goal is met.

**Approved V2 repair:** milestones are real sequential escrow gates. The design target is trust-minimised real-world milestone handling rather than a false claim that arbitrary physical-world facts can be verified trustlessly on-chain.

V2 mechanism under implementation:
- creator commits evidence URI + evidence hash on-chain;
- full contributor review/challenge window;
- stake-weighted contributor approve/challenge signals;
- challenge threshold routes the milestone to constrained arbitration;
- below-threshold, unchallenged milestone can release permissionlessly after the review window;
- arbitration rejection or timeout protects unreleased escrow for refunds;
- creator failure to submit the next milestone within a fixed grace period also activates refunds;
- milestones release sequentially only;
- no hidden admin bypass.

Acceptance criteria:
- Milestone release conditions are enforced on-chain.
- Tests prove milestones cannot be released before their gate and cannot be double-claimed.
- Ordering is sequential and tested.
- A challenged milestone cannot silently release.
- Arbitrator inactivity cannot freeze funds indefinitely.
- Creator inactivity cannot freeze funds indefinitely.

### P0 — Creator backend writes are not cryptographically authorized

Wallet signature verification existed, but creator mutations did not consume an authenticated session or an action-bound signature. Address strings supplied in request bodies were therefore identity claims rather than proof of wallet control.

**Repair applied on remediation branch:** wallet verification now issues short-lived, revocable bearer sessions bound to the signing address. Creator-only routes enforce session ownership, admin-only collections are separated, and new challenge requests no longer invalidate another challenge already being signed.

Verified acceptance evidence:
- unauthenticated creator creation is rejected;
- a correctly authenticated wrong wallet cannot read, edit, submit, publish or update another creator's submission;
- creator listing is scoped to the authenticated wallet;
- private audit reads require admin authorization when an admin token is configured;
- session/challenge and route-level regression checks run inside `backend:check`.

### P0 — Publication records are not independently verified on-chain

The old backend checked address/hash syntax and matching supplied strings, but did not verify the transaction receipt, factory event, deployed campaign, creator ownership, metadata URI, factory address, token, arbitrator, version or expected chain.

**Repair applied on remediation branch:** publication is now fail-closed and derived from independent chain evidence. The backend uses its own server-side RPC and trust anchors rather than browser configuration.

The verifier requires and checks:
- configured backend RPC resolves the configured chain ID;
- transaction and receipt both exist and the receipt succeeded;
- configured confirmation threshold has been reached;
- transaction and receipt target the backend-approved `CampaignFactoryV2` address;
- transaction sender matches the authenticated creator session;
- approved factory has deployed code at the publication block;
- factory reports `CONTRACT_VERSION == 2.0.0-alpha`;
- factory token and arbitrator match backend-approved addresses;
- transaction calldata is exactly `createCampaignWithMetadata` and matches the approved submission description, metadata URI, goal, duration and full milestone schedule;
- exactly one `CampaignV2Created` event is emitted by the approved factory;
- event creator, token, arbitrator, description, metadata URI, goal and deadline match the approved submission/configuration;
- event deadline equals publication block timestamp plus approved duration;
- emitted campaign address has deployed code at the publication block;
- deployed campaign reports the expected owner, token, arbitrator, goal, deadline, description and milestone count.

The stored publish record is populated from verified chain evidence. Browser-supplied campaign/factory/chain fields are not publication authority.

Negative regression cases cover missing/fabricated transaction evidence, wrong chain, wrong factory, wrong creator, wrong metadata, wrong token, deployed campaign state mismatch and insufficient confirmations.

### P0 — Frontend dependency contains published security vulnerabilities

The original lockfile pinned Next.js 16.2.9, within published affected ranges for August 2026 critical advisories.

**Repair applied on remediation branch:** Next.js and matching `eslint-config-next` are pinned to 16.3.3 with an npm-generated lockfile. 16.3.3 is the current patched stable release for the identified critical advisories as of 2026-08-30. The branch does not enable Next.js `cacheComponents`; a separately reported 16.3.x cacheComponents memory-retention issue should still be watched rather than ignored.

Acceptance criteria:
- `npm ci` succeeds from a clean checkout.
- Current advisory review contains no known critical vulnerability attributable to the selected Next.js version.
- Frontend lint and production build pass.
- CI records the exact resolved version.

### P1 — Public backend data exposure

Creator collections now require creator sessions and operator audit/submission collections require admin authorization. Public campaign data remains separately exposed through the intended public route.

### P1 — Rate limiting trusts unvalidated forwarded IP data

The backend still uses the first `x-forwarded-for` value as client identity without a trusted-proxy policy.

**Remaining repair:** use the socket address by default; only trust forwarded headers under an explicit trusted-proxy deployment policy.

### P1 — Nonce supersession permits authentication disruption

**Repair applied:** independently issued wallet challenges remain valid until used/expired instead of unsolicited later challenge issuance invalidating an existing pending challenge.

## Contract V2 strategy

The existing contracts are not proxy-upgradeable. The repair uses a **new deployment version**, not an in-place upgrade.

Approved structure:
- retain current V1 contracts as historical source;
- introduce `CampaignV2` / `CampaignFactoryV2` with explicit version identity;
- V2 goal and deadline are immutable;
- V2 factory is configured for one compatible token, with TES intended as Teslastarter's native/default deployment token;
- do not hard-code the TES address into audited campaign logic;
- frontend/backend configuration must be version-aware;
- never silently treat a V1 address as V2;
- document known V1 deployments and their limitations.

Potential atomic swap/routing from another BSC asset into TES belongs outside CampaignV2. Any later swap adapter must receive its own slippage, allowance, router, MEV and atomicity review.

No mainnet V2 deployment is authorized by this brief.

## Implementation sequence

### Phase 1 — Characterisation and security baseline
1. Add tests that reproduce each confirmed contract defect or assert the V2 invariant replacing it.
2. Add backend authorization tests that demonstrate impersonation paths and prove repairs.
3. Record current expected failures before repair.
4. Upgrade the vulnerable frontend dependency with a regenerated lockfile.

### Phase 2 — Contract V2
1. Implement exact hard cap with excess left in contributor wallet.
2. Make goal/deadline immutable and remove failed-campaign revival paths.
3. Implement an explicit campaign lifecycle/state machine.
4. Correct contribution/refund accounting and terminal pro-rata refunds.
5. Implement real sequential milestone gates with contributor challenge and constrained arbitration.
6. Add creator-inactivity and arbitration-timeout recovery.
7. Add adversarial/invariant/sequence tests.
8. Keep deployable bytecode within normal EVM size limits; never use unlimited-contract-size settings as a release workaround.

### Phase 3 — Backend identity and provenance
1. Convert wallet verification into enforceable short-lived authorization. **Implemented and regression-tested.**
2. Protect creator mutations. **Implemented and route-tested.**
3. Protect operator-only reads/writes. **Implemented for current admin collections.**
4. Verify publication receipts and V2 factory/campaign evidence over an independently configured RPC. **Implemented and regression-tested.**
5. Harden proxy/rate-limit handling. **Remaining.**

### Phase 4 — Integration
1. Update frontend contract ABI/version handling. **V2 publish ABI/event implemented; broader V2 milestone readers/actions remain.**
2. Update creator authentication UX. **Session flow implemented; further UX hardening may follow.**
3. Update publish flow to wait for independent chain verification. **Implemented.**
4. Verify the actual deployed TES token behaviour before using it as escrow asset. **Remaining.**
5. Run complete BSC testnet happy-path and adversarial paths. **Remaining.**

### Phase 5 — Release gate
A release candidate must not be marked mainnet-ready unless all of the following are true:
- clean `npm ci` at root and frontend;
- Solidity compile succeeds under deployable EVM size limits;
- comprehensive contract tests pass;
- backend security/authorization/provenance tests pass;
- frontend lint and production build pass;
- current dependency advisory review passes;
- actual TES token contract behaviour and admin powers have been reviewed;
- no P0 issue remains open;
- independent smart-contract security review has been completed;
- testnet soak testing has exercised contribution, cap, funding failure, refunds, evidence submission, challenge, arbitration approval/rejection/timeout, milestone release, publication verification, moderation, and recovery paths;
- deployed bytecode/source/compiler settings/version addresses are recorded;
- mainnet deployment still requires a separate explicit human approval.

## Verified checkpoint — 2026-08-30

Commit `709effca9bca7a9e04e50723661d5d37667e4e71` passed the complete CI chain on PR #74, including root install, backend state/auth/session tests, independent publication verifier negative/positive tests, route-level creator authorization tests, Solidity compilation, contract tests, preflight, frontend clean install, lint and production build.

This is evidence that the checked code compiles and that the specified regression tests pass. It is **not** an independent smart-contract audit, penetration test, or mainnet authorization.

## Product decisions — resolved 2026-08-30

1. Funding policy: **hard cap at goal; excess never enters escrow**.
2. Token architecture: **TES-first/native Teslastarter deployment, token-generic audited escrow**.
3. Milestones: **real sequential gates**.
4. Real-world verification: **trust-minimised optimistic evidence/challenge system with constrained dispute fallback**, not a false trustless-oracle claim.
5. Failed/rejected milestone: **all unreleased escrow becomes refundable pro-rata to backers**.
6. Deadline: **no extension after first contribution or expiry; V2 currently removes mutable deadline economics entirely**.
7. Upgrade model: **new immutable V2 contracts; V1 remains unchanged**.
8. Mainnet: **prohibited until the complete operational/security/review/testnet gates pass and a separate human release decision is made**.

## Change-control rules for this remediation

- Work only on the remediation branch until reviewed.
- Use a draft pull request until CI and security gates are green.
- Do not weaken tests to obtain a green build.
- Do not manually invent lockfile integrity values.
- Do not use local unlimited-contract-size flags to hide deployment-size failures.
- Do not merge or deploy to mainnet automatically.
- Every security-relevant assumption must be visible in code, tests, or documentation.
