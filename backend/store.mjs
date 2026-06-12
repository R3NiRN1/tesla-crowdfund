import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { READINESS, withReadiness } from "./validation.mjs";

const DEFAULT_DATA_DIR = path.join(process.cwd(), "backend", "data");
const DEFAULT_DB_FILE = path.join(DEFAULT_DATA_DIR, "backend-alpha-store.json");

const ALLOWED_TRANSITIONS = Object.freeze({
  draft: new Set(["pending_review"]),
  pending_review: new Set(["needs_changes", "approved", "rejected"]),
  needs_changes: new Set(["pending_review"]),
  approved: new Set(["published"]),
  rejected: new Set(),
  published: new Set(),
});

function backendError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

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

function normalizeSubmission(payload, existing = {}) {
  const metadataURI = String(payload.metadataURI ?? payload.metadataUri ?? existing.metadataURI ?? "").trim();
  return withReadiness({
    ...existing,
    creatorAddress: String(payload.creatorAddress ?? existing.creatorAddress ?? "").trim(),
    title: String(payload.title ?? existing.title ?? "").trim(),
    shortDescription: String(payload.shortDescription ?? existing.shortDescription ?? "").trim(),
    longDescription: String(payload.longDescription ?? existing.longDescription ?? "").trim(),
    imageUrl: String(payload.imageUrl ?? existing.imageUrl ?? "").trim(),
    metadataURI,
    contractInput: payload.contractInput ?? existing.contractInput ?? null,
  });
}

export function createSubmission(payload = {}) {
  const store = readStore();
  const now = new Date().toISOString();
  const submission = normalizeSubmission(payload, {
    id: randomUUID(),
    status: "draft",
    review: null,
    publish: null,
    createdAt: now,
    updatedAt: now,
  });

  store.submissions.unshift(submission);
  appendAudit(store, "submission.created", {
    submissionId: submission.id,
    title: submission.title,
    readiness: submission.readiness.state,
  });
  writeStore(store);
  return submission;
}

function publicCampaign(submission) {
  const publishedSeconds = BigInt(Math.floor(Date.parse(submission.publish.publishedAt) / 1000));
  const deadline = (publishedSeconds + BigInt(submission.contractInput.duration)).toString();

  return {
    id: submission.id,
    title: submission.title,
    shortDescription: submission.shortDescription,
    creatorAddress: submission.creatorAddress,
    creatorVerification: submission.verification?.state ?? "unverified",
    status: "published",
    goal: submission.contractInput.goal,
    deadline,
    milestones: submission.contractInput.milestoneDescriptions.map((description, index) => ({
      description,
      amount: submission.contractInput.milestoneAmounts[index],
    })),
    campaignAddress: submission.publish.campaignAddress,
    transactionHash: submission.publish.transactionHash,
    factoryAddress: submission.publish.factoryAddress,
    chainId: submission.publish.chainId,
    metadataURI: submission.publish.metadataURI,
    publishedAt: submission.publish.publishedAt,
  };
}

export function listPublishedCampaigns() {
  return readStore().submissions
    .filter((submission) => submission.status === "published" && submission.publish)
    .map(publicCampaign);
}

export function updateSubmission(id, patch = {}) {
  const store = readStore();
  const index = store.submissions.findIndex((submission) => submission.id === id);
  if (index === -1) {
    throw backendError(404, "submission-not-found", "submission not found");
  }

  const previous = store.submissions[index];
  if (!["draft", "needs_changes"].includes(previous.status)) {
    throw backendError(409, "submission-locked", "only draft or needs-changes submissions can be edited");
  }

  const next = normalizeSubmission(patch, {
    ...previous,
    id: previous.id,
    status: previous.status,
    review: previous.review,
    publish: previous.publish,
    createdAt: previous.createdAt,
    updatedAt: new Date().toISOString(),
  });

  store.submissions[index] = next;
  appendAudit(store, "submission.updated", {
    submissionId: id,
    readiness: next.readiness.state,
  });
  writeStore(store);
  return next;
}

export function updateSubmissionStatus(id, status, patch = {}) {
  if (!Object.hasOwn(ALLOWED_TRANSITIONS, status)) {
    throw backendError(400, "invalid-submission-status", `invalid submission status: ${status}`);
  }

  const store = readStore();
  const index = store.submissions.findIndex((submission) => submission.id === id);
  if (index === -1) {
    throw backendError(404, "submission-not-found", "submission not found");
  }

  const previous = withReadiness(store.submissions[index]);
  if (!ALLOWED_TRANSITIONS[previous.status]?.has(status)) {
    throw backendError(409, "invalid-status-transition", `cannot move submission from ${previous.status} to ${status}`);
  }

  if (status === "pending_review" && previous.readiness.state !== READINESS.CONTRACT_READY) {
    throw backendError(422, "submission-not-contract-ready", "submission must be contract-ready before it can be submitted");
  }

  if (status === "approved" && patch.verification?.state !== "manually_verified") {
    throw backendError(422, "manual-verification-required", "manual verification is required before approval");
  }

  const next = withReadiness({
    ...previous,
    ...patch,
    id: previous.id,
    status,
    createdAt: previous.createdAt,
    updatedAt: new Date().toISOString(),
  });

  store.submissions[index] = next;
  appendAudit(store, `submission.${status}`, {
    submissionId: id,
    previousStatus: previous.status,
    reviewDecision: next.review?.decision ?? null,
    verificationState: next.verification?.state ?? "unverified",
    reviewerAddress: next.review?.reviewerAddress ?? null,
  });
  writeStore(store);
  return next;
}

export function issueNonce(address) {
  const store = readStore();
  const normalized = String(address || "").trim().toLowerCase();

  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    throw backendError(400, "invalid-wallet-address", "valid wallet address is required");
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
    throw backendError(400, "invalid-nonce", "nonce not found or already used");
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
