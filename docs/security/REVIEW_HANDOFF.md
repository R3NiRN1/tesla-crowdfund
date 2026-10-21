# Security review handoff

Status: **proposed dispositions only; independent human review remains required**.
No thread has been manually resolved and no alert has been dismissed by this run.

## Candidate and evidence

- Security source: PR #74, `9a6dcba887a553f42142ddbf4f52c177564a7662`.
- Toolchain/publication and lint repair: PR #75, `39867c86a7e9ec2c47d550c937e0ff67d696a3e4`.
- Executed local support: PR #76, `33d2638f538226584becd15f15f86fc8e324144d`.
- [Support functional CI: all seven jobs passed](https://github.com/R3NiRN1/tesla-crowdfund/actions/runs/39692971379).
- [Current toolchain security checks: all five passed](https://github.com/R3NiRN1/tesla-crowdfund/actions/runs/39695711010),
  including the previously failing full dependency audit. Fresh dependent-head
  results remain required; earlier failed audit runs are historical.
- The clean local support commit passed all eleven integrated checks documented in
  [the local rehearsal](../LOCAL_REHEARSAL.md). Local time travel is not live BSC soak evidence.

Review links below use the scanner's original PR locations. Current source may
have shifted: the candidate's zero-transfer guard is at CampaignV2.sol:484.

## Proposed dispositions

1. CodeQL DOM text: `AddressValue` renders `short(address)` as a React text
   child in a span or anchor. No HTML parser or `dangerouslySetInnerHTML` sink
   occurs in that path. Proposed false positive for this specific text sink.
   Explorer URL validation is a separate concern, not cleared by this proposal.
2. Slither strict equality: `_safeExactTransfer` uses `amount == 0` to skip
   zero transfers, not to compare an attacker-modifiable token balance. The refund
   tests exercise dust accounting. Proposed false positive for this exact guard.
3. Eleven timestamp findings: comparisons intentionally enforce immutable 7-day
   review, 14-day arbitration and 30-day submission windows. Tests exercise ordering,
   premature release denial and timeout/refund paths. Proposed intended mechanism,
   pending independent confirmation of boundary comparisons and timing assumptions.

## Unresolved threads

| Finding | Scanner location | Review |
| --- | --- | --- |
| CodeQL / DOM text reinterpreted as HTML | `frontend/app/page.tsx:52` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893219331) |
| Slither / Dangerous strict equalities | `contracts/CampaignV2.sol:498` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893220924) |
| Slither / Block timestamp | `contracts/CampaignV2.sol:207` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893220937) |
| Slither / Block timestamp | `contracts/CampaignV2.sol:215` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893220951) |
| Slither / Block timestamp | `contracts/CampaignV2.sol:265` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893220969) |
| Slither / Block timestamp | `contracts/CampaignV2.sol:275` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893220986) |
| Slither / Block timestamp | `contracts/CampaignV2.sol:299` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893221002) |
| Slither / Block timestamp | `contracts/CampaignV2.sol:335` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893221018) |
| Slither / Block timestamp | `contracts/CampaignV2.sol:359` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893221028) |
| Slither / Block timestamp | `contracts/CampaignV2.sol:380` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893221040) |
| Slither / Block timestamp | `contracts/CampaignV2.sol:393` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893221053) |
| Slither / Block timestamp | `contracts/CampaignV2.sol:403` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893221071) |
| Slither / Block timestamp | `contracts/CampaignV2.sol:438` | [Thread](https://github.com/R3NiRN1/tesla-crowdfund/pull/74#discussion_r3893221077) |

## Reviewer task and release hold

Confirm or reject each proposal with source-specific rationale in PR #74. This
packet is preparation for that review, not a security approval. Review the final
integrated commit again if source or dependencies change.

The [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) remains
unpatched upstream, but this candidate no longer contains that dependency path.
The [lint repair](../LINT_DEPENDENCY_REPAIR.md) uses a dependency-free directory
lookup, not an audit waiver or framework downgrade. Root and full frontend
audits pass. This does not supply independent human disposition of these threads.

Public BSC testing additionally needs browser-wallet acceptance, a designated
test host and separately authorized chain-97 deployment/rehearsal. No mainnet
authorization is supplied by this document.

