# Wallet transaction recovery

Scope: issue #77, stacked on the unmerged V2 candidate from PRs #74-#76 and #80.
Operator role follow-up #81 / PR #82 is a separate pending security dependency.
This is a wallet lifecycle repair, not a contract security approval or permission
to deploy. Shared testing remains on hold.

## Safety contract

- A synchronous tab-local reservation prevents repeat requests before the wallet
  returns a hash. A session safety marker retains uncertainty across reloads.
- A confirmed user rejection can release that reservation. A transport error
  cannot prove that nothing was broadcast; it keeps sending locked and allows
  checking an existing transaction hash instead.
- A manually supplied hash is tracking only. Even a matching, confirmed older
  success or revert cannot resolve the uncertain original request, unlock a
  second send, or trigger an intended-action success callback. Independent
  reconciliation is required. A matching backend-verified publication may
  complete the publication goal while retaining the public hint against redeploy.
- If a returned hash cannot be persisted, retain the request safety marker.
  Partial storage failure must not remove the last reload protection.
- Known hashes are tracked on their original chain. Missing receipts, timeouts
  and early backend verification failures do not enable a replacement deployment.
- Successful receipts are consumed once. Callback identity changes and fresh
  campaign objects cannot repeat the success refresh.
- Canonical receipt proof and replacement links are bound to recovery scope,
  original hash, chain, account and target. A cancelled request cannot clear a
  different pending action, including when a failed storage write retains a lock.
- Replacement tracking follows the linked replacement hash even when the receipt
  waiter reports an error without receipt data. Canonical three-block proof is
  still required; cancelled or unrelated replacements never emit intended success.
- A newer unsaved live-tab hint takes precedence over stale session storage until
  persistence succeeds. This is recovery continuity, not on-chain or publish truth.
- Funding requires valid decimals, balance and allowance from the configured
  chain. There is no optimistic approval fallback. Amounts with excess precision,
  scientific notation or values outside uint256 are rejected, not rounded.
- Approval previews, accepted capacity, balance and allowance retain exact token
  precision. They do not pass through floating-point formatting that can display
  a nonzero authorization as zero or change large digits. Invalid amounts expose
  an accessible reason instead of only disabling the transaction buttons.
- Participant reads are scoped to wallet, campaign and milestone. Late results
  cannot enable actions for a different wallet. Refresh/error states block writes.
- Creator publication retries verification of the existing transaction. Only a
  matching, independently verified backend publication response completes it.

## Recovery boundary

Session storage contains public transaction identifiers and unverified safety
markers only. It does not contain keys, signatures, sessions, balances, approval
status or publication truth. An edited hint cannot create a backend publication
record. RPC and backend checks remain authoritative.

Storage is best-effort. If unavailable, recovery works only while this tab stays
alive. Retain the transaction hash and check wallet/explorer history before any
manual recovery. Clearing browser data, using another tab/device, a compromised
wallet/RPC/browser, or changing deployed code are not an exactly-once guarantee.
The wallet remains the signer; the backend never takes custody.

Receipt confirmations reduce reorg risk; they cannot eliminate it. The backend
may require more confirmations than the UI. Retry backend verification without
sending another deployment transaction. Cancelled or unrelated replacements must
never be labelled a successful intended action.

Viem 2.56.1 can omit replacement callbacks when its cached receipt reaches a
higher confirmation depth. Same-client/hash observers also inherit the first
observer policy. Application waiters therefore capture replacement identity at
one confirmation and enforce completion depth separately. Real installed-engine
tests characterize both limitations; an AST-based guard forbids a hidden or
higher-depth application waiter. Dependency upgrades must review those tests.

## Automated checks

`npm --prefix frontend run test:ui` runs actual React DOM components with mocked
wallet/RPC/backend boundaries. It is required by the frontend CI job and
`npm run verify:mvp`. The suite needs Node 22.22.2 or Node 24.15+; CI uses Node 24.
These are not actual-wallet browser acceptance tests or an external penetration
test. The original three contribution regressions failed before repair.

The focused polish adds six red-before/green-after contribution cases for exact
small/large approval previews and explicit invalid-amount feedback. That checkpoint
passed 119 cases. Subsequent isolation, reverted-replacement and dirty-storage
regressions also failed before repair. These tests verify the displayed amount
against the actual approval argument; they do not replace wallet acceptance.

Keep the existing backend authorization/publication, contract, persistence,
dependency audit, lint and production-build checks. Passing them does not prove
that untested security properties hold.

## Release hold

The accompanying bounded adversarial review identified separate blockers in
ownership/escrow liveness, draft-storage bounds and operator-session revocation.
Their proposed fixes are isolated in draft PR #80, a dependency of this wallet
change. Require final combined checks and independent review before shared
testing; green separate suites are not enough. Do not restart the completed launch
queue wholesale. Preserve the independent security review and live-test gates in
the [readiness report](FIRST_ROUND_TEST_READINESS_2026-10-21.md).
