import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function loadEnvFile(filePath, override = false) {
  if (!filePath) return;
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) return;
  dotenv.config({ path: resolvedPath, override });
}

loadEnvFile(".env");
loadEnvFile("frontend/.env.local");
loadEnvFile(process.env.ENV_FILE, true);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const errors = [];
const warnings = [];

function readRequiredEnv(name, message) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    errors.push(message);
    return "";
  }
  return value.trim();
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isHttpOrigin(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
  } catch {
    return false;
  }
}

function validateAddress(name, value) {
  if (!value) return;
  if (value.toLowerCase() === ZERO_ADDRESS) {
    warnings.push(`${name} is ZERO_ADDRESS (setup/read-only mode).`);
    return;
  }
  if (!ADDRESS_REGEX.test(value)) {
    errors.push(`${name} must be a 0x-prefixed 40-byte hex address.`);
  }
}

const rpcUrl = readRequiredEnv(
  "NEXT_PUBLIC_RPC_URL",
  "NEXT_PUBLIC_RPC_URL is required and must be an http(s) URL."
);
const chainIdRaw = readRequiredEnv(
  "NEXT_PUBLIC_CHAIN_ID",
  "NEXT_PUBLIC_CHAIN_ID is required and must be 56 or 97."
);
const factoryAddress = readRequiredEnv(
  "NEXT_PUBLIC_FACTORY_ADDRESS",
  `NEXT_PUBLIC_FACTORY_ADDRESS is required (use ${ZERO_ADDRESS} for setup mode).`
);
const tokenAddress = readRequiredEnv(
  "NEXT_PUBLIC_TOKEN_ADDRESS",
  `NEXT_PUBLIC_TOKEN_ADDRESS is required (use ${ZERO_ADDRESS} for setup mode).`
);
const bscscanBase = readRequiredEnv(
  "NEXT_PUBLIC_BSCSCAN_BASE",
  "NEXT_PUBLIC_BSCSCAN_BASE is required and must be an http(s) URL."
);

const chainId = chainIdRaw ? Number(chainIdRaw) : Number.NaN;
if (chainIdRaw) {
  if (!Number.isFinite(chainId)) {
    errors.push("NEXT_PUBLIC_CHAIN_ID must be numeric.");
  } else if (chainId !== 56 && chainId !== 97) {
    errors.push(`NEXT_PUBLIC_CHAIN_ID must be 56 or 97 (got ${chainId}).`);
  }
}

const rpcUrlIsValid = !!rpcUrl && isHttpUrl(rpcUrl);
const bscscanBaseIsValid = !!bscscanBase && isHttpUrl(bscscanBase);

if (rpcUrl && !rpcUrlIsValid) {
  errors.push("NEXT_PUBLIC_RPC_URL must be a valid http(s) URL.");
}

if (bscscanBase && !bscscanBaseIsValid) {
  errors.push("NEXT_PUBLIC_BSCSCAN_BASE must be a valid http(s) URL.");
}

validateAddress("NEXT_PUBLIC_FACTORY_ADDRESS", factoryAddress);
validateAddress("NEXT_PUBLIC_TOKEN_ADDRESS", tokenAddress);

const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const storageDriver = process.env.STORAGE_DRIVER?.trim() || (process.env.DATABASE_URL ? "postgres" : "file");
const databaseUrl = process.env.DATABASE_URL?.trim() || "";
const corsOrigin = process.env.CORS_ORIGIN?.trim() || "*";

if (nodeEnv === "production" && (storageDriver !== "postgres" || !databaseUrl)) {
  errors.push("Production backend requires STORAGE_DRIVER=postgres and DATABASE_URL.");
} else if (storageDriver === "file") {
  warnings.push("File storage is local-development only; production requires PostgreSQL.");
}

if (nodeEnv === "production" && (!corsOrigin || corsOrigin === "*")) {
  errors.push("Production backend requires explicit CORS_ORIGIN.");
} else if (corsOrigin === "*") {
  warnings.push("CORS_ORIGIN is wildcard; production must pin the frontend origin.");
} else if (!isHttpOrigin(corsOrigin)) {
  errors.push("CORS_ORIGIN must be an http(s) origin without a path.");
}

async function checkRpcChainId() {
  const chainIdIsValid = chainId === 56 || chainId === 97;
  if (!rpcUrlIsValid || !chainIdIsValid) return;

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });

    if (!response.ok) {
      warnings.push(`RPC check skipped: ${response.status} ${response.statusText}.`);
      return;
    }

    const payload = await response.json();
    const rpcChainId = Number.parseInt(payload?.result ?? "", 16);
    if (!Number.isFinite(rpcChainId)) {
      warnings.push("RPC check skipped: unable to parse eth_chainId response.");
      return;
    }

    if (rpcChainId !== chainId) {
      errors.push(`RPC chainId ${rpcChainId} does not match NEXT_PUBLIC_CHAIN_ID ${chainId}.`);
    }
  } catch (err) {
    warnings.push(`RPC check skipped: ${err?.message || err}`);
  }
}

await checkRpcChainId();

if (warnings.length) {
  console.warn("Preflight warnings:");
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (errors.length) {
  console.error("Preflight errors:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Preflight OK.");
