import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT_ENV = path.resolve(process.cwd(), ".env");
const ROOT_EXAMPLE = path.resolve(process.cwd(), ".env.example");
const FRONTEND_ENV = path.resolve(process.cwd(), "frontend/.env.local");
const FRONTEND_EXAMPLE = path.resolve(process.cwd(), "frontend/.env.example");

const ROOT_TEMPLATE = `# Frontend (copy to frontend/.env.local, not here)\n# Use ZERO_ADDRESS placeholders to keep the app in setup/read-only mode.\n\n# [BSC TESTNET (97)]\nNEXT_PUBLIC_RPC_URL=https://bsc-testnet.publicnode.com\nNEXT_PUBLIC_CHAIN_ID=97\nNEXT_PUBLIC_FACTORY_ADDRESS=0x0000000000000000000000000000000000000000\nNEXT_PUBLIC_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000\nNEXT_PUBLIC_BSCSCAN_BASE=https://testnet.bscscan.com\n# This release candidate uses an injected browser wallet only.\n`;

const FRONTEND_TEMPLATE = `# Next.js public environment variables\n# Use ZERO_ADDRESS placeholders to keep the app in setup/read-only mode.\n\n# ------------------------\n# [BSC TESTNET (97)]\n# ------------------------\nNEXT_PUBLIC_RPC_URL=https://bsc-testnet.publicnode.com\nNEXT_PUBLIC_CHAIN_ID=97\nNEXT_PUBLIC_FACTORY_ADDRESS=0x0000000000000000000000000000000000000000\nNEXT_PUBLIC_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000\nNEXT_PUBLIC_BSCSCAN_BASE=https://testnet.bscscan.com\n\n# ------------------------\n# [BSC MAINNET (56)]\n# ------------------------\n# NEXT_PUBLIC_RPC_URL=https://bsc-dataseed.binance.org\n# NEXT_PUBLIC_CHAIN_ID=56\n# NEXT_PUBLIC_FACTORY_ADDRESS=0x0000000000000000000000000000000000000000\n# NEXT_PUBLIC_TOKEN_ADDRESS=0x0000000000000000000000000000000000000000\n# NEXT_PUBLIC_BSCSCAN_BASE=https://bscscan.com\n\n# This release candidate uses an injected browser wallet only.\n`;

function ensureExample(filePath, template) {
  if (fs.existsSync(filePath)) return false;
  fs.writeFileSync(filePath, template, "utf8");
  return true;
}

function copyIfMissing(targetPath, examplePath, template) {
  if (fs.existsSync(targetPath)) return "exists";
  if (!fs.existsSync(examplePath)) {
    ensureExample(examplePath, template);
  }
  fs.copyFileSync(examplePath, targetPath);
  return "created";
}

function logResult(label, result) {
  if (result === "exists") {
    console.log(`✓ ${label} already exists`);
  } else {
    console.log(`✓ ${label} created from template`);
  }
}

const createdRootExample = ensureExample(ROOT_EXAMPLE, ROOT_TEMPLATE);
const createdFrontendExample = ensureExample(FRONTEND_EXAMPLE, FRONTEND_TEMPLATE);

if (createdRootExample) {
  console.log("✓ Created missing .env.example template");
}

if (createdFrontendExample) {
  console.log("✓ Created missing frontend/.env.example template");
}

const rootEnvResult = copyIfMissing(ROOT_ENV, ROOT_EXAMPLE, ROOT_TEMPLATE);
const frontendEnvResult = copyIfMissing(FRONTEND_ENV, FRONTEND_EXAMPLE, FRONTEND_TEMPLATE);

logResult(".env", rootEnvResult);
logResult("frontend/.env.local", frontendEnvResult);

console.log("\nRunning preflight checks...\n");

const child = spawn("node", ["scripts/preflight.mjs"], { stdio: "inherit" });

child.on("close", (code) => {
  if (code !== 0) {
    console.error("\nPreflight failed. Fix the errors above and rerun `npm run setup`.");
    process.exit(code ?? 1);
  }

  console.log("\nSetup complete! Next steps:");
  console.log("1) Review frontend/.env.local and update addresses when ready.");
  console.log("2) Run `npm run doctor` to confirm configuration.");
  console.log("3) Start the app with `npm run dev` (from the frontend directory).\n");
});
