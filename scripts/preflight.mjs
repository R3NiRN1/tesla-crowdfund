import dotenv from "dotenv";

dotenv.config();

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const errors = [];
const warnings = [];

function readEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    errors.push(`${name} is required (use ${ZERO_ADDRESS} for placeholders).`);
    return "";
  }
  return value.trim();
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

const rpcUrl = readEnv("NEXT_PUBLIC_RPC_URL");
const chainIdRaw = readEnv("NEXT_PUBLIC_CHAIN_ID");
const factoryAddress = readEnv("NEXT_PUBLIC_FACTORY_ADDRESS");
const tokenAddress = readEnv("NEXT_PUBLIC_TOKEN_ADDRESS");
const bscscanBase = readEnv("NEXT_PUBLIC_BSCSCAN_BASE");

const wcEnabled = process.env.NEXT_PUBLIC_WC_ENABLED === "true";
const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID?.trim() || "";

const chainId = Number(chainIdRaw);
if (!Number.isFinite(chainId)) {
  errors.push("NEXT_PUBLIC_CHAIN_ID must be numeric.");
} else if (chainId !== 56 && chainId !== 97) {
  warnings.push(`NEXT_PUBLIC_CHAIN_ID is ${chainId} (expected 56 or 97 for BSC).`);
}

if (!bscscanBase.startsWith("http")) {
  warnings.push("NEXT_PUBLIC_BSCSCAN_BASE should be an http(s) URL.");
}

validateAddress("NEXT_PUBLIC_FACTORY_ADDRESS", factoryAddress);
validateAddress("NEXT_PUBLIC_TOKEN_ADDRESS", tokenAddress);

if (wcEnabled && !wcProjectId) {
  errors.push("NEXT_PUBLIC_WC_PROJECT_ID is required when NEXT_PUBLIC_WC_ENABLED=true.");
}

if (!wcEnabled && !wcProjectId) {
  warnings.push("WalletConnect disabled; NEXT_PUBLIC_WC_PROJECT_ID not required.");
}

async function checkRpcChainId() {
  if (!rpcUrl || !Number.isFinite(chainId)) return;

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
