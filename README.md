# Tesla Crowdfund — Hardhat + Next.js Monorepo

This repository contains a full-stack **BNB Smart Chain (BSC) testnet** dApp.

It is built to work **exclusively with the TeslaCoin (ERC-20 compatible) token**
deployed on **BNB Smart Chain test networks**.

---

## Tech Stack

- **Hardhat** — smart contracts, scripts, and tests (BSC testnet)
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

```bash
npm install
cp .env.example .env
npm run compile
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

---

## Happy Path (from a fresh clone)

```bash
npm install
cp .env.example .env
npm run preflight
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

Never commit real `.env` files.

---

## Smart Contracts (Hardhat — BNB Smart Chain Testnet)

Compile:
npx hardhat compile

Test:
npx hardhat test

Local node:
npx hardhat node

Deploy:
npx hardhat run scripts/deploy.ts --network localhost

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

## Security Notes

- Secrets are never committed
- Only `.env.example` files are tracked
- Line endings normalized via `.gitattributes`

---

## License

MIT
