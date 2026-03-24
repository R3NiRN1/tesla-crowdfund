# Tesla Crowdfund — Hardhat + Next.js Monorepo

This repository contains a full-stack **BNB Smart Chain (BSC) testnet + mainnet** dApp.

It is built to work **exclusively with the TeslaCoin (ERC-20 compatible) token**
deployed on **BNB Smart Chain testnet and mainnet**.

---

## Tech Stack

- **Hardhat** — smart contracts, scripts, and tests (BSC testnet + mainnet)
- **Next.js** — frontend application (`/frontend`)
- **TeslaCoin ERC-20** — the only supported token

This repo is structured for local development and testing while keeping secrets safe.

---

## Repository Structure

.
├── contracts/          Solidity smart contracts
├── scripts/            Hardhat scripts (deploy, interact)
├── test/               Contract tests
├── artifacts/          Hardhat build output (gitignored)
├── cache/              Hardhat cache (gitignored)
├── frontend/           Next.js app
│   ├── app/            App Router pages/components
│   ├── lib/            Frontend helpers (web3, config)
│   ├── public/         Static assets
│   ├── .env.example    Frontend env template (safe)
│   └── package.json
├── .env.example        Hardhat env template (safe)
├── hardhat.config.ts
├── package.json
└── README.md

---

## Prerequisites

- Node.js 18+
- npm
- Git

---

## Quickstart

See the full install guide: [docs/INSTALL.md](docs/INSTALL.md).




Architecture and planning docs:
- [docs/ARCHITECTURE_V1.md](docs/ARCHITECTURE_V1.md)
- [docs/ROADMAP_V1.md](docs/ROADMAP_V1.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)

## First run (local dev)

```bash
npm run setup
npm run doctor
cd frontend
npm run dev
```

Reset instructions:

- Delete `frontend/.env.local` to return to setup/read-only mode.
- Clear browser storage keys: `teslaCrowdfundConfig:v1`, `teslaCrowdfundDrafts:v1`, `teslaCrowdfundAudit:v1`.

## Happy Path (from a fresh clone)

```bash
npm ci
cp .env.example .env
cp frontend/.env.example frontend/.env.local
npm run preflight # or: ENV_FILE=frontend/.env.local npm run preflight
npm run test:contracts
npm run build:frontend
cd frontend
npm run dev
```

---

## Setup (Local Development)

### Install dependencies

From the repo root:

npm install

---

### Environment variables

Hardhat (root):

cp .env.example .env

Frontend (Next.js):

cd frontend
cp .env.example .env.local

⚠️ **Do not change only `NEXT_PUBLIC_CHAIN_ID`.** Your `NEXT_PUBLIC_RPC_URL`,
`NEXT_PUBLIC_FACTORY_ADDRESS`, `NEXT_PUBLIC_TOKEN_ADDRESS`, and
`NEXT_PUBLIC_BSCSCAN_BASE` must match the same network.

Never commit real `.env` files.

---

## Smart Contracts (Hardhat — BNB Smart Chain Testnet/Mainnet)

Compile:
npx hardhat compile

Test:
npx hardhat test

Local node:
npx hardhat node

Deploy:
npm run deploy:testnet

### Deploy flow (recommended)

Testnet:

1) `npm run preflight`
2) `npm run deploy:testnet`
3) `npm run smoke:testnet`
4) `npm run verify:testnet`

Mainnet (guarded):

1) `npm run preflight`
2) `CONFIRM_MAINNET=YES npm run deploy:mainnet`
3) `npm run smoke:mainnet`
4) `npm run verify:mainnet`

Deployments are saved to `deployments/<network>.json`. Use `--force` with the deploy
script to overwrite an existing deployment file.

---

## Frontend (Next.js)

cd frontend
npm install
npm run dev

App runs at http://localhost:3000

### First run setup wizard (no env edits required)

If you do not have `.env.local` values handy, open the first-run wizard at:

- http://localhost:3000/setup

The wizard stores configuration locally in your browser under
`teslaCrowdfundConfig:v1` (localStorage). To reset, clear that key in DevTools
or run:

```
localStorage.removeItem("teslaCrowdfundConfig:v1")
```

Routes added for the new UX:

- `/setup` (first-run wizard)
- `/campaigns` (draft list)
- `/campaigns/new` (campaign draft builder)
- `/admin` (local admin dashboard)

⚠️ **Admin dashboard security (MVP):** admin mode is local-only and does not
enforce authentication yet. Treat this as a temporary UX-only scaffold until
a real backend/auth flow is implemented.

---

## BSC Testnet (97)

1) Update `frontend/.env.local` with testnet values (chainId 97 and testnet explorer).
2) Run `npm run preflight` to validate config.
3) Deploy with `npm run deploy:testnet`.
4) Copy deployed addresses into `frontend/.env.local` and rebuild the UI.

---

## BSC Mainnet (56, guarded)

- **Deploys are blocked unless you set** `CONFIRM_MAINNET=YES` in your root `.env`.
- Always do a small test tx, verify addresses, and confirm gas settings before deploying.
- Run: `npm run preflight` → `CONFIRM_MAINNET=YES npm run deploy:mainnet`.

---

## Mainnet Checklist (short + strict)

- ✅ Confirm `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_CHAIN_ID=56`, contract addresses, and BscScan base are all mainnet.
- ✅ Run `npm run preflight` and fix any errors (including RPC chainId mismatch).
- ✅ Verify deployer address + balance, and set `CONFIRM_MAINNET=YES`.
- ✅ Deploy with `npm run deploy:mainnet`, then update `frontend/.env.local` and rebuild.

---

## Security Notes

- Secrets are never committed
- Only `.env.example` files are tracked
- Line endings normalized via `.gitattributes`

---

## License

MIT
