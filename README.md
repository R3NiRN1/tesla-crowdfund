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

---

## Frontend (Next.js)

cd frontend
npm install
npm run dev

App runs at http://localhost:3000

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
