# BSC testnet V2 release-candidate rehearsal

This runbook is restricted to BSC testnet chain ID 97. The harness checks the connected chain before any transaction and refuses every other chain, including BSC mainnet chain ID 56. It deploys and uses repository-owned `MockTES`; it does not use, verify, approve, transfer or otherwise interact with the historical TES mainnet address.

This is a long-running, phased rehearsal. The immutable contract windows are seven days for contributor review, fourteen days for arbitration and thirty days for creator submission. BSC testnet cannot be time-warped, so complete evidence takes more than thirty days. The state file makes the run reproducible and resumable without weakening those windows.

## Prerequisites

- Use a reviewed release-candidate commit with a clean working tree.
- Create six distinct, testnet-only wallets for deployer, creator, arbitrator, two backers and outsider. Fund them only with test BNB.
- Run a production-like backend against PostgreSQL, apply `npm run backend:migrate`, and provision an operator with `submission.read,submission.review,audit.read,diagnostics.read`.
- Configure backend publication verification for chain 97, the factory, MockTES token, arbitrator and required confirmations.
- Copy `.env.testnet.example` into an untracked secret source. Never commit it or the harness state.

Record the exact candidate commit:

```text
git rev-parse HEAD
```

Set `TESTNET_RELEASE_COMMIT` to that full SHA and set `ARBITRATOR_ADDRESS` to the testnet arbitrator wallet. Leave `TOKEN_ADDRESS` empty so the guarded deployment creates MockTES.

## Deploy and validate V2

```text
npm ci
npm run compile
npm run preflight
npm run deploy:testnet
npm run smoke:testnet
```

Review `deployments/bscTestnet.json`. It must have schema `tes-crowdfund-deployment/v2`, chain ID 97, network `bscTestnet`, token source `MockTES`, factory version `2.0.0-alpha`, the expected arbitrator and the release commit. The smoke script verifies deployed code, identities and ERC-20 behaviour by minting and transferring one token base unit; zero initial MockTES supply is intentional.

## Run phases

Set `TESTNET_HARNESS_PHASE` before each invocation:

```text
TESTNET_HARNESS_PHASE=seed npm run testnet:harness
TESTNET_HARNESS_PHASE=funding-expiry npm run testnet:harness
TESTNET_HARNESS_PHASE=review-1 npm run testnet:harness
TESTNET_HARNESS_PHASE=review-2 npm run testnet:harness
TESTNET_HARNESS_PHASE=arbitration-timeout npm run testnet:harness
TESTNET_HARNESS_PHASE=creator-inactivity npm run testnet:harness
TESTNET_HARNESS_PHASE=verify-all npm run testnet:harness
```

If a phase is too early, the harness fails without sending that transition and reports the first eligible UTC time. Do not alter contract clocks or state to accelerate the rehearsal.

The seed phase creates and funds separate campaigns for:

- backend-authenticated creation, operator review and independently verified publication;
- a below-goal contribution and an oversized final contribution whose excess stays in the wallet;
- exact-goal transitions;
- evidence submission and contributor approval;
- challenge-threshold entry into dispute;
- disputed milestone approval;
- a later disputed milestone rejection after the first release;
- arbitration timeout;
- creator inactivity timeout; and
- an underfunded campaign.

Later phases assert receipts and read on-chain balances, states, milestone records, release totals, refund totals and terminal escrow. The final phase fails unless every scenario is terminal, each campaign balance equals `totalContributed - totalReleased - totalRefunded`, every terminal balance is zero, and the backend public record matches the verified creation transaction.

## Evidence and abort conditions

Retain the untracked `.testnet-runs/bsc-testnet-v2.json`, deployment manifest, transaction hashes, backend audit export and CI links in the controlled release evidence store. Stop immediately on any chain, address, version, code, receipt, accounting, publication or release-commit mismatch. Do not retry by changing expected values.

Passing this rehearsal supports BSC-testnet readiness only. It is not an independent audit, does not select production arbitrator governance or hosting/secrets vendors, and is not mainnet approval.
