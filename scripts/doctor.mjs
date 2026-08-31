import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { execSync } from "node:child_process";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function readEnvFile(filePath) {
  if (!filePath) return null;
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) return null;
  const raw = fs.readFileSync(resolved, "utf8");
  return dotenv.parse(raw);
}

function mergeEnv(base, extra) {
  if (!extra) return base;
  return { ...base, ...extra };
}

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeUrl(value) {
  if (!value) return "—";
  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    return `${value.slice(0, 24)}${value.length > 24 ? "…" : ""}`;
  }
}

function shortenAddress(value) {
  if (!value) return "—";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function getVersions() {
  let npmVersion = "unknown";
  try {
    npmVersion = execSync("npm -v", { encoding: "utf8" }).trim();
  } catch {
    npmVersion = "unavailable";
  }
  return { node: process.version, npm: npmVersion };
}

const envFile = process.env.ENV_FILE;
const rootEnv = readEnvFile(".env");
const frontendEnv = readEnvFile("frontend/.env.local");
const overrideEnv = envFile ? readEnvFile(envFile) : null;

let mergedEnv = { ...process.env };
mergedEnv = mergeEnv(mergedEnv, rootEnv);
mergedEnv = mergeEnv(mergedEnv, frontendEnv);
mergedEnv = mergeEnv(mergedEnv, overrideEnv);

const chainIdRaw = mergedEnv.NEXT_PUBLIC_CHAIN_ID?.trim() ?? "";
const rpcUrl = mergedEnv.NEXT_PUBLIC_RPC_URL?.trim() ?? "";
const bscscanBase = mergedEnv.NEXT_PUBLIC_BSCSCAN_BASE?.trim() ?? "";
const factoryAddress = mergedEnv.NEXT_PUBLIC_FACTORY_ADDRESS?.trim() ?? "";
const tokenAddress = mergedEnv.NEXT_PUBLIC_TOKEN_ADDRESS?.trim() ?? "";

const warnings = [];
const errors = [];

const chainId = chainIdRaw ? Number(chainIdRaw) : Number.NaN;
if (!chainIdRaw) {
  errors.push("Missing NEXT_PUBLIC_CHAIN_ID.");
} else if (!Number.isFinite(chainId)) {
  errors.push("NEXT_PUBLIC_CHAIN_ID must be numeric.");
} else if (chainId !== 56 && chainId !== 97) {
  errors.push(`NEXT_PUBLIC_CHAIN_ID must be 56 or 97 (got ${chainId}).`);
}

if (!rpcUrl) {
  errors.push("Missing NEXT_PUBLIC_RPC_URL.");
} else if (!isHttpUrl(rpcUrl)) {
  errors.push("NEXT_PUBLIC_RPC_URL must be a valid http(s) URL.");
}

if (!bscscanBase) {
  warnings.push("Missing NEXT_PUBLIC_BSCSCAN_BASE.");
} else if (!isHttpUrl(bscscanBase)) {
  warnings.push("NEXT_PUBLIC_BSCSCAN_BASE must be a valid http(s) URL.");
}

function addressStatus(label, value) {
  if (!value) {
    warnings.push(`${label} missing (setup/read-only mode).`);
    return { value: "", isZero: false, isValid: false };
  }
  const isZero = value.toLowerCase() === ZERO_ADDRESS;
  if (isZero) {
    warnings.push(`${label} is ZERO_ADDRESS (setup/read-only mode).`);
  }
  const isValid = ADDRESS_REGEX.test(value);
  if (!isZero && !isValid) {
    errors.push(`${label} must be a 0x-prefixed 40-byte hex address.`);
  }
  return { value, isZero, isValid };
}

const factoryStatus = addressStatus("NEXT_PUBLIC_FACTORY_ADDRESS", factoryAddress);
const tokenStatus = addressStatus("NEXT_PUBLIC_TOKEN_ADDRESS", tokenAddress);

const { node, npm } = getVersions();

console.log("Doctor report\n----------------\n");
console.log(`Node: ${node}`);
console.log(`npm: ${npm}`);
console.log("\nEnv files:");
console.log(`- .env: ${rootEnv ? "found" : "missing"}`);
console.log(`- frontend/.env.local: ${frontendEnv ? "found" : "missing"}`);
console.log(`- ENV_FILE (${envFile ?? "not set"}): ${overrideEnv ? "found" : envFile ? "missing" : "n/a"}`);

console.log("\nFrontend config:");
console.log(`- NEXT_PUBLIC_CHAIN_ID: ${chainIdRaw || "—"}`);
console.log(`- NEXT_PUBLIC_RPC_URL: ${sanitizeUrl(rpcUrl)}`);
console.log(`- NEXT_PUBLIC_BSCSCAN_BASE: ${sanitizeUrl(bscscanBase)}`);
console.log(`- NEXT_PUBLIC_FACTORY_ADDRESS: ${shortenAddress(factoryAddress)}${
  factoryStatus.isZero ? " (ZERO_ADDRESS)" : ""
}`);
console.log(`- NEXT_PUBLIC_TOKEN_ADDRESS: ${shortenAddress(tokenAddress)}${tokenStatus.isZero ? " (ZERO_ADDRESS)" : ""}`);
console.log("- Wallet connector: injected browser provider only");

if (warnings.length) {
  console.warn("\nWarnings:");
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (errors.length) {
  console.error("\nErrors:");
  errors.forEach((error) => console.error(`- ${error}`));
}

let summary = "OK";
if (errors.length) {
  summary = "ERROR";
} else if (warnings.length) {
  summary = "WARN";
}

console.log("\nSummary:");
console.log(`Status: ${summary}`);

console.log("\nHints:");
if (errors.length) {
  console.log("- Fix the errors above, then rerun `npm run preflight`.");
}
if (!factoryStatus.isZero && !tokenStatus.isZero && !errors.length) {
  console.log("- Contract addresses look good. You can start the UI and connect a wallet.");
}
if (factoryStatus.isZero || tokenStatus.isZero) {
  console.log("- ZERO_ADDRESS values keep the app in setup/read-only mode.");
}
if (!frontendEnv) {
  console.log("- Create frontend/.env.local (run `npm run setup` for a guided installer)." );
}
