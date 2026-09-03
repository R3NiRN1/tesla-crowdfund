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

If a final requested contribution exceeds the amount still needed, CampaignV2 transfers only the remaining amount from the contributor. The excess never enters escrow and therefore cannot become trapped or require a special rescue/refund path.

### Token architecture: TES first, generic escrow

TES is the intended native/default funding token for Teslastarter and the project is intended to create substantive TES utility.

CampaignV2 and CampaignFactoryV2 are nevertheless token-generic and should work with a compatible standard BSC ERC-20/BEP-20 token. The token address is a factory deployment parameter rather than hard-coded campaign logic.

Any future atomic swap flow from another BSC asset into TES belongs in a separate application/router integration. It must receive a separate security review for allowances, slippage, router trust, MEV, price manipulation and atomicity.

### Alternative-asset funding: convert through TES, not alongside it

Teslastarter's escrow and milestone voting asset is TES. A future backer who arrives
with another supported BSC asset may be offered a separately reviewed conversion route
that converts that asset into TES before the contribution reaches campaign escrow.
Alternative assets must not be accepted as parallel campaign-escrow assets.

This keeps TES as the platform's economic rail while avoiding an arbitrary extra
holder-only gate. The conversion mechanism, supported assets, fees, liquidity sources,
slippage limits, approvals and any creator or backer TES-staking rules remain undecided
and require a separate architecture and security decision before implementation.

### Milestones: real sequential escrow gates

Milestones are real sequential gates rather than labels on creator-controlled withdrawals.

The V2 mechanism uses on-chain evidence commitments, contributor review/challenge, a stake-weighted challenge threshold, constrained dispute resolution, timeout recovery and sequential release. This is described as trust-minimised rather than falsely claiming that arbitrary physical-world completion can be verified trustlessly by a smart contract.

### Failed milestone: unreleased escrow returns to backers

If a milestone is ultimately rejected, arbitration times out, or the creator fails the defined milestone-submission window, all unreleased escrow enters a terminal pro-rata refund state for backers.

### Deadline and upgrade policy

V2 funding goal and deadline economics are immutable. A failed campaign cannot be revived by extending its deadline.

V2 is a new immutable deployment line. Existing V1 deployments remain unchanged and must never be represented as upgraded V2 contracts.

### Mainnet policy

No mainnet deployment is authorized until the full operational/security gates are met, including completed implementation, testnet exercise/soak, actual TES contract compatibility review and independent smart-contract security review. Mainnet still requires a separate explicit human release decision.

### Publication provenance: backend independently verifies chain truth

A creator-supplied transaction hash is only a lookup key, not proof of publication.

The backend must use its own server-side RPC and approved chain/factory/token/arbitrator configuration to reconstruct publication from BSC evidence. It verifies the successful transaction, confirmation threshold, V2 factory version, exact approved creation calldata, `CampaignV2Created` event, creator, token, arbitrator, metadata, goal, deadline and deployed CampaignV2 state before recording a campaign as published.

If chain evidence is missing, ambiguous, mismatched or unavailable, publication fails closed. Browser-supplied campaign/factory/chain values are never publication authority.
