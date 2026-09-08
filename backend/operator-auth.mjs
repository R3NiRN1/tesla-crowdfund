import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { getRepository } from "./repository.mjs";
import { appendAudit } from "./store.mjs";

const OPERATOR_SESSION_TTL_MS = Number(process.env.OPERATOR_SESSION_TTL_MS || 30 * 60 * 1000);
export const OPERATOR_ROLES = Object.freeze([
  "submission.read",
  "submission.review",
  "audit.read",
  "diagnostics.read",
]);

function operatorError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

function hashSecret(value) {
  return createHash("sha256").update(value).digest("hex");
}

function equalHex(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function validateRoles(roles) {
  const normalized = [...new Set(Array.isArray(roles) ? roles.map(String) : [])];
  if (!normalized.length || normalized.some((role) => !OPERATOR_ROLES.includes(role))) {
    throw operatorError(400, "invalid-operator-roles", `roles must be selected from: ${OPERATOR_ROLES.join(", ")}`);
  }
  return normalized;
}

export async function provisionOperator({ subject, displayName, roles = OPERATOR_ROLES, expiresAt = null }) {
  const normalizedSubject = String(subject || "").trim();
  const normalizedName = String(displayName || normalizedSubject).trim();
  if (!normalizedSubject || normalizedSubject.length > 200 || !normalizedName || normalizedName.length > 200) {
    throw operatorError(400, "invalid-operator-identity", "operator subject and display name are required");
  }
  const normalizedRoles = validateRoles(roles);
  const credentialId = randomUUID();
  const secret = randomBytes(32).toString("hex");
  const credential = `${credentialId}.${secret}`;
  const now = new Date().toISOString();

  return getRepository().transaction((store) => {
    if (store.operators.some((operator) => operator.subject === normalizedSubject)) {
      throw operatorError(409, "duplicate-operator", "operator subject already exists");
    }
    const operator = {
      id: randomUUID(),
      subject: normalizedSubject,
      displayName: normalizedName,
      roles: normalizedRoles,
      active: true,
      createdAt: now,
    };
    store.operators.push(operator);
    store.operatorCredentials.push({
      id: credentialId,
      operatorId: operator.id,
      secretHash: hashSecret(secret),
      createdAt: now,
      expiresAt,
      revokedAt: null,
    });
    appendAudit(store, "operator.provisioned", { operatorId: operator.id, subject: operator.subject, roles: operator.roles });
    return { operator: structuredClone(operator), credential };
  });
}

export async function authenticateOperatorCredential(value) {
  const match = String(value || "").trim().match(/^([0-9a-f-]{36})\.([a-f0-9]{64})$/i);
  if (!match) throw operatorError(401, "operator-credential-invalid", "valid operator credential is required");
  const [, credentialId, secret] = match;
  const now = new Date();
  const sessionToken = randomBytes(32).toString("hex");
  const tokenHash = hashSecret(sessionToken);

  return getRepository().transaction((store) => {
    const credential = store.operatorCredentials.find((item) => item.id === credentialId);
    if (
      !credential || credential.revokedAt ||
      (credential.expiresAt && Date.parse(credential.expiresAt) <= now.getTime()) ||
      !equalHex(credential.secretHash, hashSecret(secret.toLowerCase()))
    ) {
      throw operatorError(401, "operator-credential-invalid", "operator credential is invalid, expired, or revoked");
    }
    const operator = store.operators.find((item) => item.id === credential.operatorId);
    if (!operator?.active) throw operatorError(403, "operator-inactive", "operator identity is inactive");
    const session = {
      tokenHash,
      operatorId: operator.id,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + OPERATOR_SESSION_TTL_MS).toISOString(),
      revokedAt: null,
    };
    store.operatorSessions.push(session);
    appendAudit(store, "operator.session_issued", { operatorId: operator.id, expiresAt: session.expiresAt }, { kind: "operator", id: operator.id });
    return {
      sessionToken,
      expiresAt: session.expiresAt,
      operator: { id: operator.id, subject: operator.subject, displayName: operator.displayName, roles: [...operator.roles] },
    };
  });
}

export async function getOperatorSession(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) throw operatorError(401, "operator-session-required", "valid operator session is required");
  const store = await getRepository().read();
  const record = store.operatorSessions.find((item) => equalHex(item.tokenHash, hashSecret(token.toLowerCase())));
  if (!record || record.revokedAt) throw operatorError(401, "operator-session-invalid", "operator session is invalid or revoked");
  if (Date.parse(record.expiresAt) <= Date.now()) throw operatorError(401, "operator-session-expired", "operator session has expired");
  const operator = store.operators.find((item) => item.id === record.operatorId);
  if (!operator?.active) throw operatorError(403, "operator-inactive", "operator identity is inactive");
  return { id: operator.id, subject: operator.subject, displayName: operator.displayName, roles: [...operator.roles] };
}

export async function requireOperatorRole(sessionToken, role) {
  const operator = await getOperatorSession(sessionToken);
  if (!operator.roles.includes(role)) throw operatorError(403, "operator-role-required", `operator role ${role} is required`);
  return operator;
}

export async function revokeOperatorSession(sessionToken) {
  const token = String(sessionToken || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) return false;
  const tokenHash = hashSecret(token.toLowerCase());
  return getRepository().transaction((store) => {
    const record = store.operatorSessions.find((item) => equalHex(item.tokenHash, tokenHash));
    if (!record || record.revokedAt) return false;
    record.revokedAt = new Date().toISOString();
    appendAudit(store, "operator.session_revoked", { operatorId: record.operatorId }, { kind: "operator", id: record.operatorId });
    return true;
  });
}

export async function auditOperatorAction(operator, action, detail = {}) {
  return getRepository().transaction((store) => appendAudit(store, action, detail, { kind: "operator", id: operator.id }));
}

export async function revokeOperatorCredential(credentialId, actor = { kind: "system", id: null }) {
  return getRepository().transaction((store) => {
    const record = store.operatorCredentials.find((item) => item.id === credentialId);
    if (!record || record.revokedAt) return false;
    record.revokedAt = new Date().toISOString();
    appendAudit(store, "operator.credential_revoked", { credentialId, operatorId: record.operatorId }, actor);
    return true;
  });
}
