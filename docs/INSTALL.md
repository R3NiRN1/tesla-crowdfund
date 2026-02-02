# Installation Guide

## Prerequisites

- **Node.js 18.x (LTS)**
- **npm 9.x** (lockfileVersion 3 in root `package-lock.json`)
- Git

## Repository Layout

- Root (`/`) = Hardhat contracts + scripts
- `/frontend` = Next.js app

## 1) Clone & Install Dependencies

```bash
git clone <your-repo-url>
cd tesla-crowdfund
npm install
```

Frontend dependencies:

```bash
cd frontend
npm install
```

## 2) Environment Variables

### Root (Hardhat)

```bash
cp .env.example .env
```

Edit `.env` with:

- `BSC_TESTNET_RPC_URL`
- `BSC_MAINNET_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`
- `BSCSCAN_API_KEY` (optional, only if you add verification tooling)
- `CONFIRM_MAINNET` (set to `yes` for mainnet deploys)

### Frontend (Next.js)

```bash
cd frontend
cp .env.example .env.local
```

Edit `.env.local` with:

- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_CHAIN_ID` (97 for testnet, 56 for mainnet)
- `NEXT_PUBLIC_FACTORY_ADDRESS`
- `NEXT_PUBLIC_TOKEN_ADDRESS`
- `NEXT_PUBLIC_BSCSCAN_BASE`
- `NEXT_PUBLIC_WC_PROJECT_ID`

If you use the `/setup` wizard, the app stores a local browser config that overrides the env values for that browser session.

Never commit real `.env` files.

## 3) Run Locally

### Contracts (Hardhat)

Compile:

```bash
npm run compile
```

Local node (optional):

```bash
npx hardhat node
```

Deploy to local node (after `hardhat node`):

```bash
npx hardhat run scripts/deployFactory.ts --network localhost
```

### Frontend (Next.js)

```bash
cd frontend
npm run dev
```

App runs at: http://localhost:3000

## Troubleshooting

- **`Error: Mainnet deploy blocked...`**
  - Set `CONFIRM_MAINNET=yes` in `.env` before running mainnet deploy.
- **`invalid account` / `could not detect network`**
  - Ensure `DEPLOYER_PRIVATE_KEY` and the RPC URL are set.
- **Frontend loads but no data**
  - Confirm `NEXT_PUBLIC_FACTORY_ADDRESS` and `NEXT_PUBLIC_RPC_URL`.
- **`HardhatError: HH8` for config**
  - Check `.env` values and ensure no stray spaces or quotes.
