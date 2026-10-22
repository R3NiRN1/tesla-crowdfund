import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { createRepository, setRepositoryForTests } from "./repository.mjs";
import { OPERATOR_ROLES, provisionOperator, revokeOperatorSession } from "./operator-auth.mjs";
import { cleanupLocalResources, localChildEnv, stopChild } from "../scripts/lib/local-process.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tes-operator-routes-"));
const repository = createRepository({ storageDriver: "file", file: path.join(directory, "store.json") });
setRepositoryForTests(repository);
const failures = [];
const secrets = [];
let child;
let baseUrl;
let passed = 0;
const hash = (value) => createHash("sha256").update(value).digest("hex");

async function check(name, work) {
  try { await work(); passed += 1; console.log(`PASS operator route: ${name}`); }
  catch (error) {
    failures.push(new Error(name, { cause: error }));
    console.error(`FAIL operator route: ${name}: ${error.message}`);
  }
}

async function availablePort() {
  const socket = createServer();
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error("loopback port allocation timed out")); }, 5000);
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
    socket.listen(0, "127.0.0.1", () => { clearTimeout(timer); resolve(socket.address().port); });
  });
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    let output = "";
    const finish = (error) => {
      clearTimeout(timer);
      child.stdout.removeListener("data", onData);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      if (error) reject(error); else resolve();
    };
    const onData = (chunk) => {
      output = (output + String(chunk)).slice(-4096);
      if (output.includes("TES Crowdfund backend V2 listening")) finish();
    };
    const onError = (error) => finish(error);
    const onExit = (code, signal) => finish(new Error(`backend exited before startup (${code ?? signal})`));
    const timer = setTimeout(() => finish(new Error("backend startup timed out after 10000 ms")), 10_000);
    child.stdout.on("data", onData);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function request(pathname, { token = "", method = "GET", body } = {}) {
  const headers = { connection: "close" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${pathname}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, payload: await response.json() };
}

async function login(identity) {
  const result = await request("/operator/auth", { method: "POST", body: { credential: identity.credential } });
  assert.equal(result.status, 200, "operator fixture must authenticate");
  assert.match(result.payload.sessionToken, /^[a-f0-9]{64}$/);
  secrets.push(result.payload.sessionToken);
  return result.payload.sessionToken;
}

function probe(role, token) {
  if (role === "submission.review") {
    return request("/admin/submissions/not-a-real-submission/review", { token, method: "POST", body: { decision: "rejected" } });
  }
  return request({ "submission.read": "/admin/submissions", "audit.read": "/audit", "diagnostics.read": "/admin/diagnostics" }[role], { token });
}

try {
  await repository.initialize();
  const identities = new Map();
  for (const [name, roles] of [
    ...OPERATOR_ROLES.map((role) => [role, [role]]),
    ["combined", ["diagnostics.read", "audit.read"]],
    ...["expired", "revoked", "inactive"].map((name) => [name, ["submission.read"]]),
  ]) {
    const identity = await provisionOperator({ subject: `operator-route-${name}`, roles });
    identities.set(name, identity);
    secrets.push(identity.credential, identity.credential.split(".")[1]);
  }
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["backend/server.mjs"], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: localChildEnv({ NODE_ENV: "development", STORAGE_DRIVER: "file",
      TESLA_CROWDFUND_BACKEND_DB: repository.file, BACKEND_HOST: "127.0.0.1",
      PORT: String(port), BACKEND_PORT: String(port), CORS_ORIGIN: "http://127.0.0.1:3000",
      OPERATOR_SESSION_TTL_MS: "1800000", WALLET_SESSION_TTL_MS: "1800000" }),
  });
  child.on("error", (error) => { child.spawnError = error; });
  child.stderr.resume();
  await waitForServer();

  const sessions = new Map();
  for (const [name, identity] of identities) {
    sessions.set(name, { first: await login(identity), second: OPERATOR_ROLES.includes(name) ? await login(identity) : null });
  }
  const privateKey = generatePrivateKey();
  secrets.push(privateKey);
  const wallet = privateKeyToAccount(privateKey);
  const nonce = await request("/auth/nonce", { method: "POST", body: { address: wallet.address } });
  assert.equal(nonce.status, 201);
  const signature = await wallet.signMessage({ message: nonce.payload.message });
  const walletLogin = await request("/auth/verify", { method: "POST", body: { address: wallet.address, nonce: nonce.payload.nonce, signature } });
  assert.equal(walletLogin.status, 200);
  const walletToken = walletLogin.payload.sessionToken;
  secrets.push(walletToken);
  const title = "PRIVATE_OPERATOR_ROUTE_FIXTURE";
  const created = await request("/submissions", { token: walletToken, method: "POST", body: { title } });
  assert.equal(created.status, 201);
  const submissionId = created.payload.submission.id;
  const eventId = (await repository.read()).auditLog.find((event) => event.action === "submission.created" && event.detail.submissionId === submissionId).id;

  await check("diagnostics-only keeps summaries without private audit content", async () => {
    const result = await request("/admin/diagnostics", { token: sessions.get("diagnostics.read").first });
    assert.equal(result.status, 200);
    const diagnostics = result.payload.diagnostics;
    const state = await repository.read();
    assert.equal(diagnostics.counts.submissions.draft, 1);
    assert.equal(diagnostics.counts.auditEvents, state.auditLog.length);
    assert.equal(diagnostics.counts.authNonces, state.nonces.length);
    assert.equal(diagnostics.counts.activeOperators, state.operators.length);
    assert.ok(Array.isArray(diagnostics.recentAudit), "recentAudit remains an array for compatibility");
    assert.equal(diagnostics.recentAudit.length, 0, "diagnostics-only must not expose private audit events");
    assert.equal(diagnostics.auditAccess, false);
    for (const value of [title, wallet.address, wallet.address.toLowerCase(), submissionId, eventId]) {
      assert.equal(JSON.stringify(result.payload).includes(value), false, "private fixture data must not occur anywhere in the response");
    }
  });
  await check("diagnostics plus audit retains the latest 25 audit events", async () => {
    const result = await request("/admin/diagnostics", { token: sessions.get("combined").first });
    assert.equal(result.status, 200);
    assert.equal(result.payload.diagnostics.auditAccess, true);
    const expected = (await repository.read()).auditLog.slice(0, 25);
    assert.deepEqual(result.payload.diagnostics.recentAudit, expected);
    assert.ok(expected.some((event) => event.id === eventId), "private fixture must exercise authorized audit visibility");
  });
  await check("audit-only cannot access diagnostics", async () => {
    const snapshot = await repository.read();
    const result = await request("/admin/diagnostics", { token: sessions.get("audit.read").first });
    assert.equal(result.status, 403);
    assert.equal(result.payload.error.code, "operator-role-required");
    assert.equal(result.payload.diagnostics, undefined);
    assert.deepEqual(await repository.read(), snapshot);
  });

  for (const role of OPERATOR_ROLES) {
    await check(`${role} can self-logout without revoking its second session`, async () => {
      const identity = identities.get(role);
      const pair = sessions.get(role);
      const before = await repository.read();
      const result = await request("/operator/logout", { token: pair.first, method: "POST",
        body: { sessionToken: pair.second, operatorId: identities.get("combined").operator.id } });
      const after = await repository.read();
      const denied = await probe(role, pair.first);
      const sibling = await probe(role, pair.second);
      assert.equal(result.status, 200, "each single role must be able to revoke its own session");
      assert.deepEqual(result.payload, { ok: true, operatorId: identity.operator.id });
      assert.equal(denied.status, 401, "logged-out token must lose authorization");
      assert.equal(sibling.status, role === "submission.review" ? 404 : 200, "second session must remain authorized");
      const revoked = after.operatorSessions.find((session) => session.tokenHash === hash(pair.first));
      assert.ok(Number.isFinite(Date.parse(revoked.revokedAt)));
      assert.deepEqual(after.operatorSessions, before.operatorSessions.map((session) => (
        session.tokenHash === hash(pair.first) ? { ...session, revokedAt: revoked.revokedAt } : session
      )), "no other session may change");
      assert.deepEqual(after.operatorCredentials, before.operatorCredentials);
      const events = after.auditLog.filter((event) => !before.auditLog.some((old) => old.id === event.id));
      assert.equal(events.length, 1);
      assert.equal(events[0].action, "operator.session_revoked");
      assert.deepEqual(events[0].actor, { kind: "operator", id: identity.operator.id });
      assert.deepEqual(events[0].detail, { operatorId: identity.operator.id });
      assert.ok(Number.isFinite(Date.parse(events[0].timestamp)));
      assert.ok(Date.parse(events[0].timestamp) >= Date.parse(revoked.revokedAt));
    });
  }

  // Fixture writes are serialized between completed HTTP requests, never across an in-flight request.
  await repository.transaction((store) => {
    const expired = store.operatorSessions.find((session) => session.tokenHash === hash(sessions.get("expired").first));
    expired.createdAt = new Date(Date.now() - 60_000).toISOString();
    expired.expiresAt = new Date(Date.now() - 1000).toISOString();
    store.operators.find((operator) => operator.id === identities.get("inactive").operator.id).active = false;
  });
  await revokeOperatorSession(sessions.get("revoked").first);
  const guard = sessions.get("submission.read").second;
  for (const [name, token, status, code] of [
    ["missing", "", 401, "operator-session-required"],
    ["malformed", "malformed", 401, "operator-session-required"],
    ["unknown", randomBytes(32).toString("hex"), 401, "operator-session-invalid"],
    ["expired", sessions.get("expired").first, 401, "operator-session-expired"],
    ["revoked", sessions.get("revoked").first, 401, "operator-session-invalid"],
    ["inactive", sessions.get("inactive").first, 403, "operator-inactive"],
    ["creator wallet", walletToken, 401, "operator-session-invalid"],
  ]) {
    await check(`${name} token cannot logout or revoke another session`, async () => {
      const snapshot = await repository.read();
      const result = await request("/operator/logout", { token, method: "POST",
        body: { sessionToken: guard, operatorId: identities.get("submission.read").operator.id } });
      assert.equal(result.status, status);
      assert.equal(result.payload.error.code, code);
      assert.deepEqual(await repository.read(), snapshot, "denied logout must not change sessions or audit events");
      assert.equal((await probe("submission.read", guard)).status, 200, "unrelated valid session must stay active");
    });
  }
  await check("temporary file store contains no plaintext credentials or tokens", async () => {
    const raw = fs.readFileSync(repository.file, "utf8");
    for (const secret of secrets) assert.equal(raw.includes(secret), false, "plaintext secret persisted in temporary store");
  });
  console.log(`operator route checks: ${passed} passed, ${failures.length} failed (actual loopback HTTP and file store)`);
  if (failures.length) throw new AggregateError(failures, `${failures.length} operator route regressions failed`);
  console.log("backend:operator-route-check passed");
} finally {
  const cleanup = await cleanupLocalResources([
    { name: "backend", close: async () => { if (child) await stopChild(child, { graceMs: 2000, forceMs: 2000 }); } },
    { name: "repository", close: () => repository.close() },
    { name: "temporary fixtures", close: () => {
      if (child && child.exitCode === null && !child.signalCode && !child.spawnError) throw new Error("backend is still running; cannot remove its store");
      assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(directory).startsWith("tes-operator-routes-"));
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } },
  ]);
  if (cleanup.length) throw new Error(`operator route cleanup failed: ${cleanup.map((failure) => `${failure.name}: ${failure.message}`).join("; ")}`);
}
