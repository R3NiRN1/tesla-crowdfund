import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const createWallet = () => privateKeyToAccount(generatePrivateKey());
const port = 20000 + Math.floor(Math.random() * 15000);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDb = path.join(os.tmpdir(), `tesla-crowdfund-route-security-${Date.now()}.json`);
process.env.TESLA_CROWDFUND_BACKEND_DB = tempDb;
process.env.STORAGE_DRIVER = "file";
const { createRepository, setRepositoryForTests } = await import("./repository.mjs");
const { provisionOperator } = await import("./operator-auth.mjs");
const setupRepository = createRepository({ file: tempDb });
setRepositoryForTests(setupRepository);
await setupRepository.initialize();
const { credential: operatorCredential } = await provisionOperator({
  subject: "route-security-operator",
  displayName: "Route security operator",
  roles: ["submission.read", "submission.review", "audit.read", "diagnostics.read"],
});
await setupRepository.close();

const child = spawn(process.execPath, ["backend/server.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: "development",
    BACKEND_PORT: String(port),
    TESLA_CROWDFUND_BACKEND_DB: tempDb,
    CORS_ORIGIN: "http://localhost:3000",
    STORAGE_DRIVER: "file",
    BACKEND_RPC_URL: "https://rpc.invalid.example",
    BACKEND_CHAIN_ID: "97",
    BACKEND_FACTORY_V2_ADDRESS: "0x1000000000000000000000000000000000000001",
    BACKEND_TOKEN_ADDRESS: "0x2000000000000000000000000000000000000002",
    BACKEND_ARBITRATOR_ADDRESS: "0x3000000000000000000000000000000000000003",
    BACKEND_PUBLISH_CONFIRMATIONS: "3",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (chunk) => { stderr += String(chunk); });

function waitForServer(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`backend did not start: ${stderr}`)), timeoutMs);
    const onData = (chunk) => {
      if (String(chunk).includes("TES Crowdfund backend V2 listening")) {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`backend exited before startup (${code}): ${stderr}`));
    });
  });
}

async function jsonRequest(pathname, { method = "GET", token = "", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

async function authenticate(wallet) {
  const nonceResult = await jsonRequest("/auth/nonce", {
    method: "POST",
    body: { address: wallet.address },
  });
  assert.equal(nonceResult.response.status, 201);
  const signature = await wallet.signMessage({ message: nonceResult.payload.message });
  const verifyResult = await jsonRequest("/auth/verify", {
    method: "POST",
    body: {
      address: wallet.address,
      nonce: nonceResult.payload.nonce,
      signature,
    },
  });
  assert.equal(verifyResult.response.status, 200);
  assert.match(verifyResult.payload.sessionToken, /^[a-f0-9]{64}$/);
  return verifyResult.payload.sessionToken;
}

try {
  await waitForServer();

  const owner = createWallet();
  const attacker = createWallet();
  const ownerToken = await authenticate(owner);
  const attackerToken = await authenticate(attacker);
  const operatorLogin = await jsonRequest("/operator/auth", {
    method: "POST",
    body: { credential: operatorCredential },
  });
  assert.equal(operatorLogin.response.status, 200);
  const operatorToken = operatorLogin.payload.sessionToken;

  const unauthenticatedCreate = await jsonRequest("/submissions", {
    method: "POST",
    body: { title: "Should fail" },
  });
  assert.equal(unauthenticatedCreate.response.status, 401);
  assert.equal(unauthenticatedCreate.payload.error.code, "wallet-session-required");

  const created = await jsonRequest("/submissions", {
    method: "POST",
    token: ownerToken,
    body: { title: "Owner draft", creatorAddress: owner.address },
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.submission.creatorAddress.toLowerCase(), owner.address.toLowerCase());
  const submissionId = created.payload.submission.id;

  const attackerList = await jsonRequest("/submissions", { token: attackerToken });
  assert.equal(attackerList.response.status, 200);
  assert.deepEqual(attackerList.payload.submissions, []);

  for (const [method, pathname, body] of [
    ["GET", `/submissions/${submissionId}`, undefined],
    ["PATCH", `/submissions/${submissionId}`, { title: "Hijacked" }],
    ["GET", `/submissions/${submissionId}/metadata`, undefined],
    ["POST", `/submissions/${submissionId}/submit`, {}],
    ["POST", `/submissions/${submissionId}/published`, { transactionHash: `0x${"a".repeat(64)}` }],
    ["POST", `/submissions/${submissionId}/updates`, { title: "Forged", body: "Forged update" }],
  ]) {
    const result = await jsonRequest(pathname, { method, token: attackerToken, body });
    assert.equal(result.response.status, 403, `${method} ${pathname}`);
    assert.equal(result.payload.error.code, "creator-session-mismatch", `${method} ${pathname}`);
  }

  const ownerRead = await jsonRequest(`/submissions/${submissionId}`, { token: ownerToken });
  assert.equal(ownerRead.response.status, 200);
  assert.equal(ownerRead.payload.submission.id, submissionId);

  const noAdminAudit = await jsonRequest("/audit");
  assert.equal(noAdminAudit.response.status, 401);
  assert.equal(noAdminAudit.payload.error.code, "operator-session-required");

  const adminAudit = await jsonRequest("/audit", { token: operatorToken });
  assert.equal(adminAudit.response.status, 200);
  assert.ok(Array.isArray(adminAudit.payload.auditLog));

  const failures = [];
  async function check(name, work) {
    try { await work(); console.log(`PASS route security: ${name}`); }
    catch (error) { failures.push(error); console.error(`FAIL route security: ${name}: ${error.message}`); }
  }
  async function createReadyDraft() {
    const result = await jsonRequest("/submissions", {
      method: "POST", token: ownerToken,
      body: {
        title: "Ready owner draft", shortDescription: "A valid bounded campaign description", metadataURI: "ipfs://ready-owner-draft",
        contractInput: { description: "A valid bounded contract description", goal: "1", duration: "3600", milestoneDescriptions: ["Deliver"], milestoneAmounts: ["1"] },
      },
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.payload.submission.readiness.state, "contract-ready");
    return result.payload.submission.id;
  }
  for (const length of [940_000, 2001]) {
    await check(`${length}-character owner submit note rejected atomically before bounded submission`, async () => {
      const id = await createReadyDraft();
      const before = await setupRepository.read();
      const oversized = await jsonRequest(`/submissions/${id}/submit`, {
        method: "POST", token: ownerToken, body: { note: "x".repeat(length) },
      });
      assert.equal(oversized.response.status, 400);
      assert.equal(oversized.payload.error.code, "submission-storage-limit");
      assert.deepEqual(await setupRepository.read(), before, "rejection must preserve the submission and audit log");
      const bounded = await jsonRequest(`/submissions/${id}/submit`, {
        method: "POST", token: ownerToken, body: { note: "n".repeat(2000) },
      });
      assert.equal(bounded.response.status, 200);
      assert.equal(bounded.payload.submission.status, "pending_review");
      assert.equal(bounded.payload.submission.submitNote, "n".repeat(2000));
    });
  }
  for (const field of ["note", "verificationNote"]) {
    await check(`oversized operator ${field} rejected atomically before bounded review`, async () => {
      const id = await createReadyDraft();
      const submitted = await jsonRequest(`/submissions/${id}/submit`, {
        method: "POST", token: ownerToken, body: { note: "Ready for review" },
      });
      assert.equal(submitted.response.status, 200);
      const before = await setupRepository.read();
      const oversized = await jsonRequest(`/admin/submissions/${id}/review`, {
        method: "POST", token: operatorToken,
        body: { decision: "approved", manuallyVerified: true, [field]: "x".repeat(2001) },
      });
      assert.equal(oversized.response.status, 400);
      assert.equal(oversized.payload.error.code, "submission-storage-limit");
      assert.deepEqual(await setupRepository.read(), before, "rejection must preserve the submission and audit log");
      const bounded = await jsonRequest(`/admin/submissions/${id}/review`, {
        method: "POST", token: operatorToken,
        body: { decision: "approved", manuallyVerified: true, note: "n".repeat(2000), verificationNote: "v".repeat(2000) },
      });
      assert.equal(bounded.response.status, 200);
      assert.equal(bounded.payload.submission.status, "approved");
      assert.equal(bounded.payload.submission.review.note, "n".repeat(2000));
      assert.equal(bounded.payload.submission.verification.note, "v".repeat(2000));
    });
  }
  if (failures.length) throw new AggregateError(failures, `${failures.length} route note-limit regressions failed`);

  console.log("backend:route-security-check passed");
} finally {
  child.kill("SIGTERM");
  fs.rmSync(tempDb, { force: true });
  fs.rmSync(`${tempDb}.tmp`, { force: true });
}
