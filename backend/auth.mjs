import { createHash, randomBytes } from "node:crypto";
import ethersPackage from "ethers";

import { appendAudit } from "./store.mjs";
import { getRepository } from "./repository.mjs";

const { ethers } = ethersPackage;
const SESSION_TTL_MS = Number(process.env.WALLET_SESSION_TTL_MS || 30 * 60 * 1000);
const MAX_SESSIONS = 10_000;

function authError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function validateToken(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!/^[a-fA-F0-9]{64}$/.test(token)) throw authError(401, "wallet-session-required", "valid wallet session is required");
  return token;
}

export async function getWalletSession(sessionToken) {
  const key = hashSessionToken(validateToken(sessionToken));
  const record = (await getRepository().read()).walletSessions.find((item) => item.tokenHash === key);
  if (!record || record.revokedAt) throw authError(401, "wallet-session-invalid", "wallet session is invalid or revoked");
  if (Date.parse(record.expiresAt) <= Date.now()) throw authError(401, "wallet-session-expired", "wallet session has expired");
  return { address: record.address, createdAt: record.createdAt, expiresAt: record.expiresAt };
}

export async function revokeWalletSession(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!/^[a-fA-F0-9]{64}$/.test(token)) return false;
  const key = hashSessionToken(token);
  return getRepository().transaction((store) => {
    const record = store.walletSessions.find((item) => item.tokenHash === key);
    if (!record || record.revokedAt) return false;
    record.revokedAt = new Date().toISOString();
    appendAudit(store, "auth.session_revoked", { address: record.address }, { kind: "wallet", id: record.address });
    return true;
  });
}

export async function activeWalletSessionCount() {
  const now = Date.now();
  return (await getRepository().read()).walletSessions.filter((record) => !record.revokedAt && Date.parse(record.expiresAt) > now).length;
}

function activeNonce(store, address, nonce) {
  const normalized = String(address || "").trim().toLowerCase();
  const record = store.nonces.find((item) => item.address === normalized && item.nonce === nonce && item.used === false);
  if (!record) throw authError(400, "invalid-nonce", "nonce not found or already used");
  if (!record.expiresAt || Date.parse(record.expiresAt) <= Date.now()) throw authError(400, "nonce-expired", "nonce has expired");
  return record;
}

export async function verifyWalletSignature(address, nonce, signature) {
  const initial = activeNonce(await getRepository().read(), address, nonce);
  const suppliedSignature = String(signature || "").trim();
  if (!/^0x[a-fA-F0-9]{130}$/.test(suppliedSignature)) throw authError(401, "invalid-wallet-signature", "valid wallet signature is required");
  let recoveredAddress;
  try {
    recoveredAddress = ethers.utils.verifyMessage(initial.message, suppliedSignature).toLowerCase();
  } catch {
    throw authError(401, "invalid-wallet-signature", "wallet signature could not be verified");
  }
  if (recoveredAddress !== initial.address) throw authError(401, "wallet-address-mismatch", "signature does not match the requested wallet address");

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  return getRepository().transaction((store) => {
    const record = activeNonce(store, initial.address, initial.nonce);
    const now = new Date();
    record.used = true;
    record.usedAt = now.toISOString();
    store.walletSessions = store.walletSessions
      .filter((item) => !item.revokedAt && Date.parse(item.expiresAt) > now.getTime())
      .slice(0, MAX_SESSIONS - 1);
    const session = {
      tokenHash,
      address: record.address,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      revokedAt: null,
    };
    store.walletSessions.unshift(session);
    appendAudit(store, "auth.nonce_consumed", { address: record.address }, { kind: "wallet", id: record.address });
    appendAudit(store, "auth.session_issued", { address: record.address, expiresAt: session.expiresAt }, { kind: "wallet", id: record.address });
    return {
      authenticated: true,
      address: record.address,
      authenticatedAt: now.toISOString(),
      sessionToken: token,
      expiresAt: session.expiresAt,
    };
  });
}
