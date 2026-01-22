import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const rootDir = process.cwd();
dotenv.config({ path: path.join(rootDir, ".env") });

const frontendEnv = path.join(rootDir, "frontend", ".env.local");
if (fs.existsSync(frontendEnv)) {
  dotenv.config({ path: frontendEnv });
}

const requiredVars = [
  "NEXT_PUBLIC_RPC_URL",
  "NEXT_PUBLIC_CHAIN_ID",
  "NEXT_PUBLIC_FACTORY_ADDRESS",
  "NEXT_PUBLIC_TOKEN_ADDRESS",
  "NEXT_PUBLIC_BSCSCAN_BASE",
];

const errors = [];
const warnings = [];

const getEnv = (key) => process.env[key];

for (const key of requiredVars) {
  if (!getEnv(key)) {
    errors.push(`Missing required env var: ${key}`);
  }
}

const chainIdRaw = getEnv("NEXT_PUBLIC_CHAIN_ID");
const chainId = Number(chainIdRaw);

if (!chainIdRaw) {
  // already handled by required vars
} else if (!Number.isFinite(chainId)) {
  errors.push(`NEXT_PUBLIC_CHAIN_ID must be numeric, got "${chainIdRaw}".`);
} else if (![97, 56].includes(chainId)) {
  warnings.push(`NEXT_PUBLIC_CHAIN_ID is ${chainId}, expected 97 (testnet) or 56 (mainnet).`);
}

const addressVars = ["NEXT_PUBLIC_FACTORY_ADDRESS", "NEXT_PUBLIC_TOKEN_ADDRESS"];
const addressRegex = /^0x[a-fA-F0-9]{40}$/;

for (const key of addressVars) {
  const value = getEnv(key);
  if (!value) continue;
  if (!addressRegex.test(value)) {
    errors.push(`${key} must be a 0x + 40 hex char address. Got "${value}".`);
  }
}

const wcProjectId = getEnv("NEXT_PUBLIC_WC_PROJECT_ID");
if (!wcProjectId) {
  warnings.push("NEXT_PUBLIC_WC_PROJECT_ID is missing. WalletConnect may be disabled.");
}

const rpcUrl = getEnv("NEXT_PUBLIC_RPC_URL");
if (rpcUrl && Number.isFinite(chainId)) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const payload = await response.json();
      const rpcChainId = Number.parseInt(payload?.result, 16);
      if (Number.isFinite(rpcChainId) && rpcChainId !== chainId) {
        errors.push(
          `RPC chainId mismatch: NEXT_PUBLIC_CHAIN_ID=${chainId}, RPC responded with ${rpcChainId}.`
        );
      }
    } else {
      warnings.push(`RPC check failed with status ${response.status}. Skipping chainId validation.`);
    }
  } catch (error) {
    warnings.push(`RPC check failed (${error?.message || error}). Skipping chainId validation.`);
  }
}

if (warnings.length) {
  console.warn("Preflight warnings:");
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (errors.length) {
  console.error("Preflight failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Preflight passed.");
