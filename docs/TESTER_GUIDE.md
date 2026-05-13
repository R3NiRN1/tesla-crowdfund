# TES Crowdfund Alpha Tester Guide

This guide covers the current alpha loop:

demo/read-only dashboard -> create contract-ready draft -> locally approve draft -> publish to BSC testnet through a wallet -> store local publish metadata and audit log.

## 1. Alpha Status Summary

### What Is Currently Real

- The Solidity contracts and Hardhat compile path are real project code.
- The frontend can read deployed campaign data from a configured `CampaignFactory`.
- The frontend can call existing wallet-driven contract methods when setup and network guards allow it.
- The BSC testnet publish path calls the existing `CampaignFactory.createCampaign(...)` function with the saved draft `contractInput`.
- BscScan links are real links when `NEXT_PUBLIC_BSCSCAN_BASE` or the setup wizard explorer base is configured.

### What Is Local-Only Scaffold

- Campaign drafts are browser-local records stored in `localStorage`.
- Draft readiness, local review state, admin notes, audit entries, and approved-draft JSON exports are local-only scaffold data.
- Publish metadata after a testnet transaction is a local record only. It is not backend verified.
- The setup wizard stores UI config in browser `localStorage`.

Relevant browser storage keys:

- `teslaCrowdfundConfig:v1`
- `teslaCrowdfundDrafts:v1`
- `teslaCrowdfundAudit:v1`

### What Is Testnet-Only

- The alpha publish path is intended for BSC testnet only, using `chainId 97`.
- Testnet publish requires a real BSC testnet factory address, token address, RPC URL, BscScan testnet base URL, and a wallet connected to BSC testnet.
- The app does not add a mainnet publish UX.

### What Is Not Production-Ready

- There is no backend.
- There is no real authentication.
- There is no production moderation.
- There is no server persistence.
- Local storage can be cleared or lost.
- Publish metadata is local-only and is not an indexed source of truth.

## 2. Fresh Clone Setup

Required Node version is defined in `.nvmrc`:

```bash
20.19.0
```

From a fresh clone:

```bash
nvm use
npm ci
npm --prefix frontend ci
```

Build the frontend through the root helper:

```bash
npm run build:frontend
```

Or run frontend commands directly:

```bash
npm --prefix frontend run lint
npm --prefix frontend run build
```

For local development:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

### Safe Setup/Read-Only Defaults

The frontend `.env.example` uses BSC testnet defaults with `ZERO_ADDRESS` placeholders for factory and token:

```bash
NEXT_PUBLIC_RPC_URL=https://bsc-testnet.publicnode.com
NEXT_PUBLIC_CHAIN_ID=97
NEXT_PUBLIC_FACTORY_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000
NEXT_PUBLIC_BSCSCAN_BASE=https://testnet.bscscan.com
NEXT_PUBLIC_WC_ENABLED=false
NEXT_PUBLIC_WC_PROJECT_ID=
```

These values keep the app in setup/read-only mode. You can copy them into `frontend/.env.local`, or use `/setup` and leave factory/token as `ZERO_ADDRESS` for the same safe mode.

## 3. Demo/Read-Only Test Path

To run without configured contracts:

1. Do not create `frontend/.env.local`, or use the safe setup/read-only defaults above.
2. If a previous test saved config, clear `teslaCrowdfundConfig:v1` in browser DevTools.
3. Start the frontend and open `/`.

Expected dashboard behaviour:

- Current mode should show `setup/read-only` and `demo/local`.
- Demo campaigns should be labelled `demo only - not on-chain`.
- Factory and token should show as not configured or zero-address guarded.
- Funding actions should be disabled because demo campaigns are local samples.
- Claim actions should be disabled because demo/local data is not on-chain and cannot be claimed.
- Setup prompts should point testers to `/setup` for real testnet configuration.

No wallet transaction should be sent in this path.

## 4. Contract-Ready Draft Test Path

Open `/campaigns/new`.

Required fields for a contract-ready draft:

- Title.
- Short description. This becomes `contractInput.description`.
- Positive goal amount using at most 18 decimals.
- Start date.
- End date after the start date.
- At least one milestone.
- Each milestone must have a description.
- Each milestone amount must be positive and use at most 18 decimals.
- Milestone amounts must sum exactly to the goal amount.

Beneficiary address is optional local metadata and is not part of `CampaignFactory.createCampaign` inputs.

### Valid Draft Example

1. Enter title: `Solar water pumps for villages`.
2. Enter short description: `Install solar-powered water pumps`.
3. Enter goal amount: `100`.
4. Pick a start date and a later end date.
5. Add two milestones:
   - `Procure equipment`, amount `40`
   - `Install pumps`, amount `60`
6. Confirm the Contract readiness panel shows `Ready`.
7. Click `Save local draft`.
8. Click `Download JSON` if you want to inspect the local payload.

### Invalid Milestone Total Test

1. Use a goal amount of `100`.
2. Add milestone amounts `30` and `60`.
3. Confirm the Contract readiness panel shows `Not ready`.
4. Confirm the blocker says milestone amounts must sum exactly to the goal amount.
5. Save the draft and open `/campaigns`; it should show as `incomplete`.

### Inspect JSON And `contractInput`

Downloaded JSON and the page preview should include:

```json
{
  "contractInput": {
    "description": "...",
    "goal": "...",
    "duration": "...",
    "milestoneDescriptions": ["..."],
    "milestoneAmounts": ["..."]
  }
}
```

`goal` and `milestoneAmounts` are 18-decimal token-unit strings. `duration` is in seconds.

## 5. Local Admin Review Test Path

Open `/admin`.

The admin review scaffold is local-only, unauthenticated, not production moderation, and stored in browser `localStorage`.

### Approve Locally

1. Create and save a contract-ready draft.
2. Open `/admin`.
3. Confirm the draft shows `contract-ready`.
4. Optionally enter an admin note.
5. Click `Approve locally`.
6. Confirm the draft review state changes to `locally approved`.
7. Confirm the local audit log records the action with timestamp, action, draft id, draft title, and note when present.

### Mark Needs Changes

1. Open `/admin`.
2. Enter or update an admin note.
3. Click `Mark needs changes`.
4. Confirm the draft review state changes to `needs changes`.
5. Confirm the audit log records the action locally.

### Reject Locally

1. Open `/admin`.
2. Click `Reject locally`.
3. Confirm the draft review state changes to `rejected locally`.
4. Confirm the audit log records the action locally.

### Reset To Draft

1. Open `/admin`.
2. Click `Reset to draft`.
3. Confirm the draft review state returns to `draft`.
4. Confirm this does not publish, deploy, upload, or submit anything.

### Inspect Local Audit Log

Use the `/admin` audit log panel, or inspect `teslaCrowdfundAudit:v1` in browser DevTools.

## 6. BSC Testnet Publish Test Path

The publish path is a wallet-driven testnet alpha path. It creates a local publish record after a confirmed testnet transaction, but that record is not backend verified and is not production moderation.

Required config values:

- `chainId 97`
- Real BSC testnet factory address.
- Token address.
- RPC URL.
- BscScan testnet base, usually `https://testnet.bscscan.com`.
- Wallet connected to BSC testnet.

You can save these values in `/setup` or in `frontend/.env.local`.

### Publish A Locally Approved Contract-Ready Draft

1. Configure BSC testnet values.
2. Connect a wallet on BSC testnet.
3. Create a contract-ready draft on `/campaigns/new`.
4. Save the local draft.
5. Open `/admin`.
6. Click `Approve locally`.
7. In the draft publish section, click `Publish to testnet`.
8. Confirm the transaction in the wallet.

Expected transaction states:

- `ready`
- `wallet confirmation needed`
- `transaction pending`
- `transaction confirmed`
- `transaction failed/rejected` if the wallet rejects or the transaction fails

The publish path calls:

```text
CampaignFactory.createCampaign(
  description,
  goal,
  duration,
  milestoneDescriptions,
  milestoneAmounts
)
```

Values come from `draft.contractInput`.

### Inspect Transaction Hash And Local Publish Metadata

After confirmation:

1. Open browser DevTools.
2. Inspect `localStorage`.
3. Open `teslaCrowdfundDrafts:v1`.
4. Find the draft.
5. Confirm `publishState` is `published-on-testnet locally`.
6. Confirm `publishMetadata` includes:
   - `draftId`
   - `draftTitle`
   - `publishedAt`
   - `transactionHash`
   - `factoryAddress`
   - `chainId`
7. Open `teslaCrowdfundAudit:v1`.
8. Confirm a `publish to testnet confirmed` audit entry exists.

When BscScan base is configured, the transaction hash in the UI links to the transaction on BscScan testnet.

## 7. Disabled-State Checklist

Expected disabled reasons:

- Setup/read-only mode: configure RPC, factory, and token before publishing.
- Missing or `ZERO_ADDRESS` factory: factory address must be a real configured testnet factory.
- Wallet disconnected: connect a wallet before publishing.
- Wrong network: switch wallet to the configured chain.
- Non-testnet chain: publish path supports BSC testnet `chainId 97`, not mainnet.
- Draft incomplete: draft must be `contract-ready`.
- Draft not locally approved: approve it locally in `/admin`.
- Draft already locally published: already has local `published-on-testnet` metadata.

For demo campaigns, funding and claim actions should stay disabled because demo/local data is not on-chain.

## 8. Acceptance Check Commands

Run from the repository root:

```bash
npm ci
npm run compile
npm run test:contracts
npm run preflight
npm run build:frontend
npm --prefix frontend run lint
npm --prefix frontend run build
```

For `npm run preflight`, use the safe setup/read-only values from `.env.example` or equivalent real testnet values. ZERO factory/token values are expected to produce setup/read-only warnings, not failures.

## 9. Known Limitations

- No backend.
- No real authentication.
- No production moderation.
- No server persistence.
- Browser `localStorage` can be cleared or lost.
- Publish metadata is local-only.
- No uploads.
- No mainnet publish UX.
- No indexed backend public listing.
- Contract tests currently show `0 passing` if no tests exist, so this needs future improvement.

## 10. Next Recommended Milestones

- Add real contract tests.
- Improve testnet deployment fixtures.
- Add tester screenshots or walkthrough.
- Backend foundation later: wallet auth, submissions, uploads, moderation records, indexed read model.
- Restore sensible branch rules after alpha stabilisation.
