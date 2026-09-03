# TES BSC Contract Provenance and V2 Compatibility — 2026-08

Status: **strongly corroborated identity; source-level compatibility review completed; not an independent audit**

Candidate / project-record address:

`0x9Cb4D8D3BfddC790A807178ba5548314A73A31F8`

## Why this address is treated as the historical TES BSC token

The address is not accepted merely because a public explorer labels it `Teslacoin` / `TES`.

Evidence chain:

1. The repository's own archived deployment script, preserved under `archive/scripts/archive-20260105-152049/deploy.ts`, explicitly defines this exact address as `TES token address` and uses it to deploy the historical crowdfunding factory.
2. Historical TeslaCoin/TeslaStarter project material documents the move to Binance Smart Chain and a migration/swap period in 2021.
3. BscScan shows verified source for this exact address under the contract name `Teslacoin`, with symbol `TES`, submitted for verification on 2021-10-01, matching the migration period.

Taken together, the internal deployment artifact plus public chain/source history are strong corroboration that this is the BSC TES contract used by this project.

## Verified deployed-source characteristics

The BscScan-verified source is a simple OpenZeppelin-style ERC-20 implementation (`pragma >=0.6.0 <0.8.0`) with `Teslacoin` inheriting `ERC20`.

Relevant observable characteristics from the verified source/ABI:

- ERC-20 `name`, `symbol`, `decimals`, `totalSupply`, `balanceOf`, `transfer`, `allowance`, `approve`, `transferFrom`, `increaseAllowance`, and `decreaseAllowance` are exposed.
- The inherited implementation initializes decimals to **18**.
- The published ABI does **not** expose owner/admin functions.
- The published ABI does **not** expose an external/public mint function.
- The published ABI does **not** expose pause, blacklist, whitelist, fee/tax configuration, rebase, upgrade or proxy-management functions.
- The deployed source does not show a transfer-fee override on the `Teslacoin` contract; it uses the inherited ERC-20 transfer logic.

This profile is compatible with CampaignV2's exact inbound accounting assumption. CampaignV2 deliberately rejects fee-on-transfer behaviour by checking the actual balance increase against the accepted contribution amount.

## Historical tokenomics discrepancy

Historical pre-launch migration material described a planned **0.5% transaction tax** for the BSC token. The verified deployed contract above does not expose or implement that tax mechanism.

This is recorded as a historical discrepancy:

**planned tokenomics != verified deployed code**

The V2 remediation must follow deployed code and independently verified chain behaviour, not an obsolete plan. No transfer tax is to be invented or reintroduced as part of the security repair without a separate product decision, token-contract design and security review.

A future fee-on-transfer TES replacement would not be drop-in compatible with CampaignV2's exact accounting without a deliberate contract redesign; this is intentional fail-closed behaviour.

## V2 deployment policy

- CampaignFactoryV2 remains token-generic and does not hard-code the TES address.
- A mainnet deployment must provide `TOKEN_ADDRESS` explicitly.
- Backend publication verification independently pins the approved token address through `BACKEND_TOKEN_ADDRESS` and verifies the V2 factory and campaign both report that token.
- Frontend writes are disabled if a campaign's token differs from its configured V2 factory token.
- External token source verification is not claimed by this repository's `verify` command; BscScan verification of the historical TES contract is external evidence and must be retained in release records.

## Remaining checks before mainnet

This source/provenance review does not replace release testing. Before a mainnet release candidate:

- re-read the live contract metadata/source/ABI and confirm the exact address has not been confused with a same-name token;
- perform a live read-only RPC check of name, symbol, decimals, total supply and bytecode at the configured address;
- perform BSC testnet escrow tests with MockTES and production-like V2 contracts;
- where practical, reproduce the relevant ERC-20 interaction assumptions against a fork/read-only simulation of the historical TES mainnet contract;
- include the external TES contract in the independent security review's integration assumptions.

No mainnet deployment is authorized by this document.
