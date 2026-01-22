# BSC Mainnet & Testnet Testing Guide

## Chain IDs & RPC Selection

- **BSC Testnet:** Chain ID **97**
- **BSC Mainnet:** Chain ID **56**

Pick reliable RPC endpoints and set them in `.env`:

- `BSC_TESTNET_RPC_URL`
- `BSC_MAINNET_RPC_URL`

Fund the deployer address with BNB for gas on the relevant network.

## Testnet Deploy (Recommended First)

1) Set environment variables in `.env`:

   - `BSC_TESTNET_RPC_URL`
   - `DEPLOYER_PRIVATE_KEY`

2) Compile:

```bash
npm run compile
```

3) Deploy to testnet:

```bash
npm run deploy:testnet
```

4) (Optional) Verify on BscScan

This repo does not ship with verification tooling by default. If you add the
Hardhat verify plugin, you can run `npx hardhat verify ...` and use
`BSCSCAN_API_KEY` for API access.

## Mainnet Deploy (With Guardrail)

1) Set environment variables in `.env`:

   - `BSC_MAINNET_RPC_URL`
   - `DEPLOYER_PRIVATE_KEY`
   - `CONFIRM_MAINNET=yes`

2) Compile:

```bash
npm run compile
```

3) Deploy to mainnet:

```bash
npm run deploy:mainnet
```

4) (Optional) Verify on BscScan

Follow the same verification flow as testnet if you add verification tooling.

## Safety Checklist

- Use a **fresh deployer** wallet for production.
- Never commit private keys or `.env` files.
- Start with a **small test transaction** before full release.
- Wait for multiple confirmations on mainnet.

## Rollback Guidance

- **Smart contracts are immutable** once deployed.
- For UI/config rollbacks:
  - Revert the frontend config to the previous release and redeploy the UI.
  - Keep a record of contract addresses per environment to avoid confusion.
