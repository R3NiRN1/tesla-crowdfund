import fs from "node:fs";
import path from "node:path";

import {
  buildBackupPayload,
  getBackendDbFile,
  readStoreFile,
  timestampSlug,
  unpackBackupPayload,
  validateStoreSnapshot,
  writeStoreFile,
} from "../backend/persistence.mjs";

const command = process.argv[2] || "check";
const arg = process.argv[3];

function printUsage() {
  console.log(`Usage:
  node scripts/backend-store.mjs check [backup-or-store.json]
  node scripts/backend-store.mjs backup [output-file.json]
  node scripts/backend-store.mjs restore <backup-or-store.json>

Environment:
  TESLA_CROWDFUND_BACKEND_DB overrides the active backend JSON store path.`);
}

function printResult(label, result) {
  console.log(`${label}:`);
  console.log(JSON.stringify({
    ok: result.ok,
    summary: result.summary,
    warnings: result.warnings,
  }, null, 2));
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`failed to read JSON file ${file}: ${error.message}`);
  }
}

function defaultBackupPath() {
  return path.join(process.cwd(), "backend", "data", "backups", `backend-store-${timestampSlug()}.json`);
}

function ensureParentDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

try {
  if (command === "help" || command === "--help" || command === "-h") {
    printUsage();
    process.exit(0);
  }

  if (command === "check") {
    let payload;
    let target;
    if (arg) {
      target = arg;
      if (!fs.existsSync(target)) throw new Error(`store or backup file does not exist: ${target}`);
      payload = readJsonFile(target);
    } else {
      target = getBackendDbFile();
      payload = readStoreFile(target);
    }
    const result = unpackBackupPayload(payload);
    printResult(`Checked ${target}`, result);
    process.exit(result.ok ? 0 : 1);
  }

  if (command === "backup") {
    const outputFile = arg || defaultBackupPath();
    const sourceFile = getBackendDbFile();
    const store = readStoreFile(sourceFile);
    const payload = buildBackupPayload(store, { sourceFile });
    ensureParentDir(outputFile);
    fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
    printResult(`Wrote backup ${outputFile}`, validateStoreSnapshot(payload.store));
    console.log(`sourceFile: ${sourceFile}`);
    process.exit(0);
  }

  if (command === "restore") {
    if (!arg) {
      printUsage();
      throw new Error("restore requires a backup or raw store JSON path");
    }

    const targetFile = getBackendDbFile();
    const payload = readJsonFile(arg);
    const result = unpackBackupPayload(payload);
    if (!result.ok) {
      printResult(`Refusing restore from ${arg}`, result);
      throw new Error("backup failed validation; inspect warnings before restoring");
    }

    if (fs.existsSync(targetFile)) {
      const safetyBackup = path.join(
        process.cwd(),
        "backend",
        "data",
        "backups",
        `pre-restore-${timestampSlug()}.json`,
      );
      ensureParentDir(safetyBackup);
      fs.copyFileSync(targetFile, safetyBackup);
      console.log(`Saved pre-restore copy: ${safetyBackup}`);
    }

    writeStoreFile(result.store, targetFile);
    printResult(`Restored ${targetFile}`, validateStoreSnapshot(readStoreFile(targetFile)));
    process.exit(0);
  }

  printUsage();
  throw new Error(`unknown backend-store command: ${command}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
