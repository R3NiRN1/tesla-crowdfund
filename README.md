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

## Quickstart (Happy path)

See the full install guide: [docs/INSTALL.md](docs/INSTALL.md).

```bash
npm install
cp .env.example .env
cd frontend && cp .env.example .env.local
cd ..
npm run preflight
npm run test:contracts
npm run build:frontend
cd frontend && npm run dev
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

> ⚠️ Changing only `NEXT_PUBLIC_CHAIN_ID` is not enough. You must also update
> `NEXT_PUBLIC_RPC_URL`, the deployed addresses, and `NEXT_PUBLIC_BSCSCAN_BASE`
> to match the same network (testnet vs mainnet).

---

## Smart Contracts (Hardhat — BNB Smart Chain Testnet)

Compile:
npx hardhat compile

Test:
npm run test:contracts

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

## Mainnet checklist

- ✅ Set **all** mainnet env vars (RPC URL, addresses, chain id, explorer base).
- ✅ Run `npm run preflight` and ensure it passes.
- ✅ Confirm you are on the correct wallet network (chainId 56).
- ✅ Set `CONFIRM_MAINNET=yes` before any mainnet deploy or write scripts.

---

## Security Notes

- Secrets are never committed
- Only `.env.example` files are tracked
- Line endings normalized via `.gitattributes`

---

## License

MIT
