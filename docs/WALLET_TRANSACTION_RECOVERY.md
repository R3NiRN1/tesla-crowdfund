# Wallet transaction recovery

Scope: issue #77, stacked on the unmerged V2 candidate from PRs #74-#76.
This is a wallet lifecycle repair, not a contract security approval or permission
to deploy. Shared testing remains on hold.

## Safety contract

- A synchronous tab-local reservation prevents repeat requests before the wallet
  returns a hash. A session safety marker retains uncertainty across reloads.
- A confirmed user rejection can release that reservation. A transport error
  cannot prove that nothing was broadcast; it keeps sending locked and allows
  checking an existing transaction hash instead.
- Known hashes are tracked on their original chain. Missing receipts, timeouts
  and early backend verification failures do not enable a replacement deployment.
- Successful receipts are consumed once. Callback identity changes and fresh
  campaign objects cannot repeat the success refresh.
- Funding requires valid decimals, balance and allowance from the configured
  chain. There is no optimistic approval fallback. Amounts with excess precision,
  scientific notation or values outside uint256 are rejected, not rounded.
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

Keep the existing backend authorization/publication, contract, persistence,
dependency audit, lint and production-build checks. Passing them does not prove
that untested security properties hold.

## Release hold

The accompanying bounded adversarial review identified separate blockers in
ownership/escrow liveness, draft-storage bounds and operator-session revocation.
They require separately scoped regression fixes and review before shared testing.
Do not hide them behind a green wallet test suite or restart the completed launch
queue wholesale. Preserve the independent security review and live-test gates in
the [readiness report](FIRST_ROUND_TEST_READINESS_2026-10-21.md).
