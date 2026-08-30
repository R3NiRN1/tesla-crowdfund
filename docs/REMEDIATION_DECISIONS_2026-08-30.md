# Tesla Crowdfund V2 — Remediation Decisions

Date: 2026-08-30
Status: **product decisions resolved for V2 implementation**
Related: `docs/SECURITY_REPAIR_BRIEF_2026-08.md`, draft PR #74

## Project purpose

The remediation is part of an effort to reboot the TeslaCoin/TES project. TES has existing holders, but development largely stopped after the coin was ported to a BSC token and the project currently lacks substantive token utility.

Teslastarter crowdfunding is intended as a meaningful native use for TES. The codebase must nevertheless remain reusable with another compatible standard BSC ERC-20/BEP-20 token if required.

The intended application architecture is **TES-first, token-generic at the escrow layer**. TES should be the native/default Teslastarter funding token. A later application-level swap integration may allow a user holding another BSC asset to atomically obtain TES and fund a campaign, but swap/router logic must remain outside the campaign escrow contract so that escrow accounting and security assumptions stay small and auditable.

## Confirmed decisions

### Funding cap: exact goal, excess never trapped

Campaigns have a hard funding cap at exactly the campaign goal.

If a backer requests a contribution larger than the remaining amount, V2 should accept at most the remaining amount. The preferred implementation is to transfer only the accepted amount from the wallet; the excess is never taken into escrow and therefore requires no refund transaction.

Requirements:
- `totalContributed` can never exceed `goal`;
- no valid contribution path can create surplus campaign-token escrow;
- the final contribution may be partially accepted only up to the remaining goal;
- the UI must show the accepted/remaining amount clearly;
- tests cover exact goal, one unit below/above, repeated contributions, and multiple backers racing for the final capacity.

### TES-first, compatible-token architecture

TES is the intended native/default token of Teslastarter and the first intended production configuration.

The audited Campaign V2 / Factory V2 contracts must not hard-code a particular TES address. A factory is configured with one compatible ERC-20/BEP-20 token address and every campaign created by that factory uses that token. Separate factories may therefore support other compatible BSC tokens without changing the audited campaign logic.

Before production use, the deployed TES contract must be inspected and its behaviour verified, including decimals, transfer semantics, fee-on-transfer behaviour, rebasing behaviour, owner/admin powers, blacklist/pause mechanics, and upgradeability if any. V2 escrow must reject or explicitly exclude token behaviours that violate exact accounting assumptions.

Potential swaps from another BSC asset into TES are an application/integration concern, not part of Campaign V2. Any future swap path requires separate slippage, router-allowance, MEV, token-compatibility and transaction-atomicity review.

### Milestones are real escrow gates

Milestones must have enforceable economic meaning. A milestone label must not merely describe an owner-controlled withdrawal tranche.

Requirements:
- unreleased funds remain in escrow;
- milestones are released only after their defined gate is satisfied;
- milestones cannot be double-released;
- milestones release sequentially;
- the frontend must not describe a milestone as protective unless the contract actually enforces the protection.

### Trust-minimised milestone automation is preferred

The system must not claim that a blockchain or generic oracle can objectively verify arbitrary real-world work when it cannot.

The V2 milestone design target is therefore **trust-minimised rather than falsely trustless**:
- creator commits milestone evidence and an immutable evidence URI/hash on-chain;
- a defined challenge/review period opens;
- eligible contributors can approve or challenge under explicit anti-manipulation rules;
- milestones release sequentially;
- an unchallenged/approved milestone can release automatically after its required conditions are satisfied;
- challenged milestones pause rather than silently release;
- a constrained arbitration/fallback mechanism resolves genuine disputes;
- all thresholds, timeouts, voting weights, quorum rules and fallback powers are explicit in contract state and tests;
- no hidden platform action may silently bypass the gate.

A simple platform/admin release key may be retained only as an explicitly documented early-testnet fallback, not as a disguised claim of trustlessness.

### Failed/rejected milestone outcome

If a milestone is finally rejected or the campaign is cancelled at a milestone dispute, all **unreleased** campaign escrow becomes refundable pro-rata to backers according to their still-committed contribution balances.

Already released milestone funds are not clawed back by the crowdfunding contract unless a separate mechanism is explicitly designed later.

Requirements:
- once the campaign enters the terminal refund state, no later milestone can release;
- each backer can claim no more than their economically correct share of remaining escrow;
- refund accounting conserves the token balance despite earlier milestone releases;
- tests cover multiple backers, partial milestone release before failure, rounding/boundary cases, repeat-refund attempts, and final dust handling.

### Deadline extension policy

A funding deadline cannot be extended after the first contribution or after expiry. This removes the V1 expire/refund/extend/resume ambiguity and makes the campaign lifecycle easier to reason about.

An owner may only extend an unfunded campaign before its current deadline, if deadline editing is retained at all. Removing deadline mutation entirely remains acceptable if it simplifies V2 further.

### Upgrade strategy

The corrected contracts ship as V2. Existing immutable deployments remain unchanged and must never be represented as having been upgraded.

Frontend/backend configuration must distinguish contract versions and deployment addresses explicitly.

### Mainnet release policy

No mainnet deployment is authorised until the complete system is operational and has passed the security, test, independent-review and testnet-soak gates in the repair brief. Passing CI alone is not sufficient.

## Implementation authority

These product decisions are sufficient to begin V2 contract and test implementation on `security/p0-remediation-2026-08`.

Mainnet deployment, merging to the protected release path, and any representation that the system is production-safe still require separate human approval after the documented release gates pass.

## Remaining design work — not product ambiguity

The following are engineering/security design choices to be evaluated and tested rather than unresolved product requirements:
- exact contributor challenge/approval quorum and weighting;
- challenge duration;
- anti-spam or challenge-bond mechanism;
- arbitration membership/key model and timeouts;
- recovery from a non-responsive arbitrator without giving the creator unilateral withdrawal power;
- handling of tokens whose transfer behaviour does not preserve exact balance accounting.

No implementation should describe arbitrary real-world milestone verification as fully trustless unless every release condition is objectively derivable on-chain.