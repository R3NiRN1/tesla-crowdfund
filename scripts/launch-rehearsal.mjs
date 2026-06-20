import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

import { getBackendDbFile, readStoreFile, validateStoreSnapshot } from "../backend/persistence.mjs";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const liveTestnet = process.argv.includes("--live-testnet");

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), "utf8"));
}

function readEnv(file) {
  const resolved = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolved)) return {};
  return dotenv.parse(fs.readFileSync(resolved, "utf8"));
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

function isAddress(value, { allowZero = false } = {}) {
  if (!ADDRESS_PATTERN.test(value || "")) return false;
  return allowZero || value.toLowerCase() !== ZERO_ADDRESS;
}

const errors = [];
const warnings = [];
const packageJson = readJson("package.json");
const scripts = packageJson.scripts || {};

const requiredScripts = [
  "backend:check",
  "backend:store:check",
  "backend:backup",
  "backend:restore",
  "compile",
  "test:contracts",
  "preflight",
  "build:frontend",
  "smoke:testnet",
  "launch:rehearsal",
];

for (const script of requiredScripts) {
  if (!scripts[script]) errors.push(`package.json is missing script: ${script}`);
}

const requiredDocs = [
  "docs/LAUNCH_RUNBOOK.md",
  "docs/PERSISTENCE_BACKUP.md",
  "docs/TESTER_GUIDE.md",
  "docs/LAUNCH_DIAGNOSTICS.md",
  "docs/LAUNCH_REHEARSAL.md",
];

for (const doc of requiredDocs) {
  if (!fs.existsSync(path.resolve(process.cwd(), doc))) errors.push(`missing launch document: ${doc}`);
}

if (fs.existsSync(path.resolve(process.cwd(), "docs/LAUNCH_REHEARSAL.md"))) {
  const rehearsalDoc = fs.readFileSync(path.resolve(process.cwd(), "docs/LAUNCH_REHEARSAL.md"), "utf8").toLowerCase();
  for (const phrase of [
    "fresh clone",
    "creator submission",
    "admin approval",
    "wallet publish",
    "public listing",
    "contribution",
    "refund",
    "claim",
  ]) {
    if (!rehearsalDoc.includes(phrase)) errors.push(`docs/LAUNCH_REHEARSAL.md must cover: ${phrase}`);
  }
}

try {
  const storeFile = getBackendDbFile();
  const snapshot = validateStoreSnapshot(readStoreFile(storeFile));
  if (!snapshot.ok) {
    errors.push(`backend store failed validation: ${snapshot.warnings.join("; ")}`);
  }
  console.log("Backend store summary:");
  console.log(JSON.stringify({ file: storeFile, summary: snapshot.summary, warnings: snapshot.warnings }, null, 2));
} catch (error) {
  errors.push(`backend store cannot be read: ${error.message}`);
}

const env = {
  ...process.env,
  ...readEnv(".env"),
  ...readEnv("frontend/.env.local"),
};

if (liveTestnet) {
  if (env.NEXT_PUBLIC_CHAIN_ID !== "97") errors.push("NEXT_PUBLIC_CHAIN_ID must be 97 for live testnet rehearsal.");
  if (!isHttpUrl(env.NEXT_PUBLIC_BACKEND_URL)) errors.push("NEXT_PUBLIC_BACKEND_URL must be an http(s) URL.");
  if (!isHttpUrl(env.NEXT_PUBLIC_RPC_URL)) errors.push("NEXT_PUBLIC_RPC_URL must be an http(s) URL.");
  if (!isHttpUrl(env.NEXT_PUBLIC_BSCSCAN_BASE)) errors.push("NEXT_PUBLIC_BSCSCAN_BASE must be an http(s) URL.");
  if (!isAddress(env.NEXT_PUBLIC_FACTORY_ADDRESS)) errors.push("NEXT_PUBLIC_FACTORY_ADDRESS must be a deployed non-zero address.");
  if (!isAddress(env.NEXT_PUBLIC_TOKEN_ADDRESS)) errors.push("NEXT_PUBLIC_TOKEN_ADDRESS must be a deployed non-zero address.");
  if (!isHttpUrl(env.BSC_TESTNET_RPC_URL)) errors.push("BSC_TESTNET_RPC_URL must be configured for deployment and smoke checks.");
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24) errors.push("ADMIN_TOKEN must be at least 24 characters for live rehearsal.");
  if (!isHttpUrl(env.CORS_ORIGIN) || env.CORS_ORIGIN === "*") errors.push("CORS_ORIGIN must pin the frontend origin for live rehearsal.");
  if (!env.DEPLOYER_PRIVATE_KEY) warnings.push("DEPLOYER_PRIVATE_KEY is not visible; deploy:testnet will need it in the operator environment.");
} else {
  warnings.push("Live testnet env strictness skipped. Rerun `npm run launch:rehearsal -- --live-testnet` before wallet publish rehearsal.");
}

console.log("Launch rehearsal gate:");
console.log(JSON.stringify({ liveTestnet, errors, warnings }, null, 2));

if (errors.length) {
  process.exit(1);
}
