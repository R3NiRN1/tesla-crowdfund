import { createHash, randomBytes } from "node:crypto";
import ethersPackage from "ethers";

import { consumeNonce, getActiveNonce } from "./store.mjs";

const { ethers } = ethersPackage;

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 1_000;
const sessions = new Map();

function authError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function cleanupSessions(now = Date.now()) {
  for (const [key, record] of sessions.entries()) {
    if (Date.parse(record.expiresAt) <= now) sessions.delete(key);
  }
  if (sessions.size <= MAX_SESSIONS) return;
  const oldest = [...sessions.entries()]
    .sort((left, right) => Date.parse(left[1].createdAt) - Date.parse(right[1].createdAt))
    .slice(0, sessions.size - MAX_SESSIONS);
  for (const [key] of oldest) sessions.delete(key);
}

function issueWalletSession(address) {
  cleanupSessions();
  const now = new Date();
  const token = randomBytes(32).toString("hex");
  const record = {
    address,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  };
  sessions.set(hashSessionToken(token), record);
  return {
    sessionToken: token,
    expiresAt: record.expiresAt,
  };
}

export function getWalletSession(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!/^[a-fA-F0-9]{64}$/.test(token)) {
    throw authError(401, "wallet-session-required", "valid wallet session is required");
  }

  cleanupSessions();
  const key = hashSessionToken(token);
  const record = sessions.get(key);
  if (!record) {
    throw authError(401, "wallet-session-invalid", "wallet session is invalid or expired");
  }
  if (Date.parse(record.expiresAt) <= Date.now()) {
    sessions.delete(key);
    throw authError(401, "wallet-session-expired", "wallet session has expired");
  }
  return { ...record };
}

export function revokeWalletSession(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!/^[a-fA-F0-9]{64}$/.test(token)) return false;
  return sessions.delete(hashSessionToken(token));
}

export function activeWalletSessionCount() {
  cleanupSessions();
  return sessions.size;
}

export function verifyWalletSignature(address, nonce, signature) {
  const record = getActiveNonce(address, nonce);
  const suppliedSignature = String(signature || "").trim();
  if (!/^0x[a-fA-F0-9]{130}$/.test(suppliedSignature)) {
    throw authError(401, "invalid-wallet-signature", "valid wallet signature is required");
  }

  let recoveredAddress;
  try {
    recoveredAddress = ethers.utils.verifyMessage(record.message, suppliedSignature).toLowerCase();
  } catch {
    throw authError(401, "invalid-wallet-signature", "wallet signature could not be verified");
  }

  if (recoveredAddress !== record.address) {
    throw authError(401, "wallet-address-mismatch", "signature does not match the requested wallet address");
  }

  consumeNonce(record.address, record.nonce);
  const authenticatedAt = new Date().toISOString();
  const session = issueWalletSession(record.address);
  return {
    authenticated: true,
    address: record.address,
    authenticatedAt,
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
  };
}
