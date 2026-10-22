# Confirmed security blocker repairs

Issue #79 contains proposed repairs found by bounded local adversarial testing.
This is not an independent penetration-test certificate, a zero-risk assurance,
or permission to deploy. Shared testing remains HOLD pending final-head checks
and independent review. The completed launch queue is not a security approval.

## Reproductions And Repairs

| Boundary | Before repair | Proposed repair and regression |
| --- | --- | --- |
| Creator/payment identity | Inherited ownership methods could strand or redirect funded milestone escrow | Creator is assigned once during construction; subsequent ownership mutation reverts. Three new regressions failed before repair; all 21 contract tests then passed, including release, dispute and refund liveness |
| Incomplete submission storage | Near-1 MB invalid titles, nested input and submit/review notes persisted, amplifying audit and whole-document storage | Validate hard field/array bounds before normalization and mutation, including full proposed snapshots and transitions; reject unsupported nested data. Enforce 100 total submissions per creator atomically, case-insensitively. Bound new audit fields. Initial31 checks and24 follow-up checks failed before their repairs; all60 storage checks and four HTTP note regressions then passed on a real file store |
| Operator credential revocation | An issued session retained authority after its credential was revoked | Bind sessions to their credential and recheck its identity, expiry and revocation on authorization. Revoke associated sessions atomically. Eight checks exposed the original defect; all 12 operator checks then passed on a real file store |

Both backend regression suites also run against two real PostgreSQL repository
instances through `npm run backend:postgres:check`. `npm run test:local` provisions
that database automatically, with disposable client wallets and MockTES. Require
the resulting run and final-head CI evidence; file-store tests alone do not prove
cross-instance atomicity.

The completed local run on 2026-10-22 passed all eleven integrated checks,
including those two PostgreSQL suites, production-mode role separation,
creator-wallet publication, capped contributions, dispute/refund flows, restart
and backup/restore. Earlier fixture runs correctly failed audit actor-kind and
expiry/credential uniqueness assumptions; repairs preserved database constraints
and the final run passed. Source was still uncommitted during that run; require
clean-commit and CI evidence before approval.

## Deployment And Compatibility

Repaired factories and campaigns report `2.0.1-alpha`. Frontend write guards,
backend independent publication verification, deployment, smoke, explorer verify
and rehearsal scripts require that exact version. Tests explicitly reject the
pre-fix `2.0.0-alpha` factory and campaign. A version string alone is not a code
audit: review and pin the actual new addresses, bytecode and release commit.

Existing contracts are not upgradeable through this patch. Use a fresh reviewed
factory/campaign set; do not reuse an older factory or claim this rescues escrow
already locked in an older deployment. The approved creator/payment identity is
intentionally immutable, including after campaign completion. Wallet-loss recovery
through ownership transfer is not supported.

Legacy operator sessions without a credential binding fail closed and require
fresh authentication. Existing submissions and historical audits are not silently
migrated, deleted or truncated. Oversized legacy drafts require an explicit,
backed-up remediation; new limits must not be bypassed to retain invalid data.

Do not roll back to a pre-fix backend or factory to resolve a new deployment
problem. That can re-enable unsafe ownership behavior or unbound legacy sessions.
Keep the release on hold or roll forward to a reviewed repair; preserve backups
and audit evidence before any explicit data remediation.

## Storage Limits

Incomplete is not unbounded: titles 120 characters, short descriptions 280,
long descriptions 10,000, image/media URIs 1,024, metadata URIs 512, contract
descriptions 2,000, milestone descriptions 280, numeric strings 78, eight media
references and 64 milestones. Missing or semantically invalid bounded fields can
remain drafts; review still requires contract-ready validation. Existing drafts
remain editable when the 100-per-creator creation quota is reached.
Submission, review and verification notes have a 2,000-character hard limit.
Unknown nested review/verification fields are rejected; oversized legacy fields
cannot survive a new write without explicit correction.

New audit data has bounded string lengths, depth, node count and collection size.
Full moderation records remain separate from audit summaries. These controls
remove the reproduced amplification path, not all resource-exhaustion risk:
wallet quotas are not Sybil resistance, HTTP rate limits are process-local, and
PostgreSQL still serializes a shared document. Capacity, retention and perimeter
abuse controls must be reviewed before public or high-volume operation.

## Remaining Gates

- Independently review these repairs and the final integrated wallet recovery
  candidate from issue #77 / draft PR #78; rerun checks after integration.
- Obtain human disposition of the thirteen PR #74 security threads. No alert,
  review thread, audit threshold or branch protection was waived by this repair.
- Complete actual-wallet browser acceptance, designated test-host configuration,
  authorized chain-97 rehearsal and the real multi-week soak. Local time travel
  and mocked DOM tests do not supply that evidence.
- No real funds or mainnet release. Backend custody and private-key signing
  remain prohibited. Use the [testnet runbook](../BSC_TESTNET_RUNBOOK.md) only after
  the release hold is lifted through the recorded review process.
