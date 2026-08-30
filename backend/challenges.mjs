import { randomUUID } from "node:crypto";

import { appendAudit, readStore, writeStore } from "./store.mjs";

const NONCE_TTL_MS = 5 * 60 * 1000;
const MAX_NONCE_RECORDS = 500;

function challengeError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function issueWalletChallenge(address) {
  const store = readStore();
  const normalized = String(address || "").trim().toLowerCase();

  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized) || normalized === "0x0000000000000000000000000000000000000000") {
    throw challengeError(400, "invalid-wallet-address", "valid non-zero wallet address is required");
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);
  const nonce = randomUUID();
  const message = [
    "TES Crowdfund wallet authentication",
    `Address: ${normalized}`,
    `Nonce: ${nonce}`,
    `Issued at: ${issuedAt.toISOString()}`,
    `Expires at: ${expiresAt.toISOString()}`,
    "Purpose: authenticate with the non-custodial alpha backend",
  ].join("\n");

  // Do not supersede another unused challenge for this wallet. This prevents a third
  // party from invalidating a challenge while its owner is in the process of signing it.
  const record = {
    id: randomUUID(),
    address: normalized,
    nonce,
    used: false,
    message,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const now = issuedAt.getTime();
  store.nonces = [record, ...store.nonces]
    .filter((item) => item.used !== true || Date.parse(item.expiresAt || item.usedAt || 0) > now - NONCE_TTL_MS)
    .slice(0, MAX_NONCE_RECORDS);
  appendAudit(store, "auth.nonce_issued", { address: normalized, supersedesExisting: false });
  writeStore(store);

  return {
    address: normalized,
    nonce,
    message,
    expiresAt: record.expiresAt,
  };
}
