# Tesla Crowdfund V2 — Remediation Decisions

Date: 2026-08-30
Status: product decisions in progress
Related: `docs/SECURITY_REPAIR_BRIEF_2026-08.md`, draft PR #74

## Project purpose

The remediation is part of an effort to reboot the TeslaCoin/TES project. TES has existing holders, but development largely stopped after the coin was ported to a BSC token and the project currently lacks substantive token utility.

The crowdfunding application is intended as one possible utility for TES. The codebase should not unnecessarily prevent reuse with another standard BSC ERC-20/BEP-20 token if the TES-specific reboot changes direction or a generic deployment becomes useful.

## Confirmed decisions

### Milestones are real escrow gates

Milestones must have enforceable economic meaning. A milestone label must not merely describe an owner-controlled withdrawal tranche.

Requirements:
- unreleased funds remain in escrow;
- milestones are released only after their defined gate is satisfied;
- milestones cannot be double-released;
- release ordering is explicit and testable;
- the frontend must not describe a milestone as protective unless the contract actually enforces the protection.

### Trust-minimised milestone automation is preferred

A central platform/admin approval mechanism is acceptable as a fallback/default during early development, but the preferred V2 design is a more abuse-resistant, trust-minimised mechanism.

The design must not claim that an oracle can objectively verify arbitrary real-world work when it cannot. Candidate architecture to evaluate before implementation:
- creator commits milestone evidence and an immutable evidence URI/hash on-chain;
- a defined challenge/review period opens;
- eligible contributors can approve or challenge according to a documented anti-manipulation rule;
- milestones release sequentially;
- an unchallenged/approved milestone can release automatically after the required conditions are met;
- challenged milestones pause rather than silently release;
- a defined arbitration/fallback path resolves genuine disputes;
- all thresholds, timeouts, voting weights, quorum rules and fallback powers are explicit in the contract and tests;
- no single hidden platform action can silently bypass the gate.

The exact dispute mechanism is not yet selected.

### Deadline extension policy

Default V2 policy: a funding deadline cannot be extended after the first contribution or after expiry. This removes the V1 expire/refund/extend/resume ambiguity and makes the campaign lifecycle easier to reason about.

### Upgrade strategy

The corrected contracts ship as V2. Existing immutable deployments remain unchanged and must never be represented as having been upgraded.

Frontend/backend configuration must distinguish contract versions and deployment addresses explicitly.

### Mainnet release policy

No mainnet deployment is authorised until the complete system is operational and has passed the security, test, review and testnet gates in the repair brief. Passing CI alone is not sufficient.

## Decisions still required before economic contract implementation

### 1. Funding cap

Recommended default: hard cap contributions at exactly the campaign goal. A contribution that would exceed the remaining amount should revert (or the UI may offer the remaining amount before submission).

Reason: prevents excess escrow becoming unreachable, keeps goal and milestone accounting exact, and simplifies invariants.

Product-owner confirmation required.

### 2. Token architecture

Recommended default: TES-first but token-generic.

The Solidity contracts should accept a standard ERC-20/BEP-20 token address rather than hard-code TES. The intended first production configuration can use TES, allowing crowdfunding to provide genuine TES utility while retaining the ability to deploy the audited mechanism for another compatible BSC token if required.

Before production use of TES, verify the deployed TES contract behaviour, including decimals, transfer semantics, fee-on-transfer behaviour, rebasing behaviour, owner/admin powers and any blacklist/pause mechanics. Do not assume generic ERC-20 accounting is safe for a non-standard token.

Product-owner confirmation required.

### 3. Failed/challenged milestone outcome

Recommended default: if a milestone is finally rejected/cancelled, unreleased escrow becomes claimable by backers pro-rata to their still-committed contribution balance.

Reason: otherwise milestone gates can delay withdrawal without actually protecting the remaining capital.

Product-owner confirmation required.

## Non-decision

No implementation should describe real-world milestone verification as fully trustless unless every required condition is objectively derivable on-chain. For ordinary physical/community projects, the realistic security objective is trust minimisation, transparent dispute handling and constrained powers.