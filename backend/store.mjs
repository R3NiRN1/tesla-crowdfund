import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_DATA_DIR = path.join(process.cwd(), "backend", "data");
const DEFAULT_DB_FILE = path.join(DEFAULT_DATA_DIR, "backend-alpha-store.json");

function dbFile() {
  return process.env.TESLA_CROWDFUND_BACKEND_DB || DEFAULT_DB_FILE;
}

function emptyStore() {
  return {
    version: 1,
    submissions: [],
    nonces: [],
    auditLog: [],
  };
}

function ensureStoreDir() {
  fs.mkdirSync(path.dirname(dbFile()), { recursive: true });
}

export function readStore() {
  ensureStoreDir();

  if (!fs.existsSync(dbFile())) {
    return emptyStore();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(dbFile(), "utf8"));
    return {
      version: 1,
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
      nonces: Array.isArray(parsed.nonces) ? parsed.nonces : [],
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
    };
  } catch (error) {
    throw new Error(`Failed to read backend alpha store: ${error.message}`);
  }
}

export function writeStore(store) {
  ensureStoreDir();
  const next = {
    version: 1,
    submissions: Array.isArray(store.submissions) ? store.submissions : [],
    nonces: Array.isArray(store.nonces) ? store.nonces : [],
    auditLog: Array.isArray(store.auditLog) ? store.auditLog : [],
  };

  const tmp = `${dbFile()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, dbFile());
  return next;
}

export function appendAudit(store, action, detail = {}) {
  const entry = {
    id: randomUUID(),
    action,
    detail,
    timestamp: new Date().toISOString(),
  };
  store.auditLog.unshift(entry);
  return entry;
}

export function createSubmission(payload) {
  const store = readStore();
  const now = new Date().toISOString();

  const submission = {
    id: randomUUID(),
    status: "draft",
    creatorAddress: String(payload.creatorAddress || "").trim(),
    title: String(payload.title || "").trim(),
    shortDescription: String(payload.shortDescription || "").trim(),
    longDescription: String(payload.longDescription || "").trim(),
    imageUrl: String(payload.imageUrl || "").trim(),
    metadataUri: String(payload.metadataUri || "").trim(),
    contractInput: payload.contractInput || null,
    review: null,
    publish: null,
    createdAt: now,
    updatedAt: now,
  };

  if (!submission.creatorAddress) {
    const error = new Error("creatorAddress is required");
    error.statusCode = 400;
    throw error;
  }

  if (!submission.title) {
    const error = new Error("title is required");
    error.statusCode = 400;
    throw error;
  }

  store.submissions.unshift(submission);
  appendAudit(store, "submission.created", { submissionId: submission.id, title: submission.title });
  writeStore(store);

  return submission;
}

export function updateSubmissionStatus(id, status, patch = {}) {
  const allowed = new Set(["draft", "pending_review", "approved", "rejected", "published"]);
  if (!allowed.has(status)) {
    const error = new Error(`invalid submission status: ${status}`);
    error.statusCode = 400;
    throw error;
  }

  const store = readStore();
  const index = store.submissions.findIndex((submission) => submission.id === id);
  if (index === -1) {
    const error = new Error("submission not found");
    error.statusCode = 404;
    throw error;
  }

  const now = new Date().toISOString();
  const previous = store.submissions[index];
  const next = {
    ...previous,
    ...patch,
    status,
    updatedAt: now,
  };

  store.submissions[index] = next;
  appendAudit(store, `submission.${status}`, { submissionId: id, previousStatus: previous.status });
  writeStore(store);

  return next;
}

export function issueNonce(address) {
  const store = readStore();
  const normalized = String(address || "").trim().toLowerCase();

  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    const error = new Error("valid wallet address is required");
    error.statusCode = 400;
    throw error;
  }

  const nonce = randomUUID();
  const record = {
    id: randomUUID(),
    address: normalized,
    nonce,
    used: false,
    issuedAt: new Date().toISOString(),
  };

  store.nonces.unshift(record);
  appendAudit(store, "auth.nonce_issued", { address: normalized });
  writeStore(store);

  return {
    address: normalized,
    nonce,
    message: `TES Crowdfund backend alpha login nonce: ${nonce}`,
  };
}

export function consumeNonce(address, nonce) {
  const store = readStore();
  const normalized = String(address || "").trim().toLowerCase();
  const index = store.nonces.findIndex((record) => {
    return record.address === normalized && record.nonce === nonce && record.used === false;
  });

  if (index === -1) {
    const error = new Error("nonce not found or already used");
    error.statusCode = 400;
    throw error;
  }

  store.nonces[index] = {
    ...store.nonces[index],
    used: true,
    usedAt: new Date().toISOString(),
  };
  appendAudit(store, "auth.nonce_consumed", { address: normalized });
  writeStore(store);

  return store.nonces[index];
}
