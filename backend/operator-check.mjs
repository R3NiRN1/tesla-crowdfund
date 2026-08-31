import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const file = path.join(os.tmpdir(), `tesla-crowdfund-operator-${Date.now()}.json`);
process.env.TESLA_CROWDFUND_BACKEND_DB = file;
process.env.STORAGE_DRIVER = "file";

const { createRepository, setRepositoryForTests } = await import("./repository.mjs");
const {
  authenticateOperatorCredential,
  getOperatorSession,
  provisionOperator,
  requireOperatorRole,
  revokeOperatorCredential,
  revokeOperatorSession,
} = await import("./operator-auth.mjs");

try {
  const repository = createRepository({ file });
  setRepositoryForTests(repository);
  await repository.initialize();
  const created = await provisionOperator({
    subject: "security-reviewer",
    displayName: "Security Reviewer",
    roles: ["submission.read", "submission.review"],
  });
  assert.match(created.credential, /^[0-9a-f-]{36}\.[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(await repository.read()).includes(created.credential), false);

  const final = created.credential.at(-1);
  const tamperedCredential = `${created.credential.slice(0, -1)}${final === "0" ? "1" : "0"}`;
  await assert.rejects(authenticateOperatorCredential(tamperedCredential), (error) => error.code === "operator-credential-invalid");
  const authenticated = await authenticateOperatorCredential(created.credential);
  assert.match(authenticated.sessionToken, /^[a-f0-9]{64}$/);
  assert.equal((await getOperatorSession(authenticated.sessionToken)).subject, "security-reviewer");
  assert.equal((await requireOperatorRole(authenticated.sessionToken, "submission.review")).id, created.operator.id);
  await assert.rejects(requireOperatorRole(authenticated.sessionToken, "audit.read"), (error) => error.code === "operator-role-required");

  assert.equal(await revokeOperatorSession(authenticated.sessionToken), true);
  await assert.rejects(getOperatorSession(authenticated.sessionToken), (error) => error.code === "operator-session-invalid");
  const credentialId = created.credential.split(".")[0];
  assert.equal(await revokeOperatorCredential(credentialId), true);
  await assert.rejects(authenticateOperatorCredential(created.credential), (error) => error.code === "operator-credential-invalid");

  const raw = fs.readFileSync(file, "utf8");
  assert.equal(raw.includes(created.credential), false);
  assert.equal(raw.includes(authenticated.sessionToken), false);
  console.log("backend:operator-check passed");
} finally {
  fs.rmSync(file, { force: true });
}
