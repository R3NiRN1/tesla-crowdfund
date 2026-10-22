import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const file = path.join(os.tmpdir(), `tesla-crowdfund-operator-${Date.now()}.json`);

const { createRepository, setRepositoryForTests } = await import("./repository.mjs");
const {
  authenticateOperatorCredential,
  getOperatorSession,
  OPERATOR_ROLES,
  provisionOperator,
  requireOperatorRole,
  revokeOperatorCredential,
  revokeOperatorSession,
} = await import("./operator-auth.mjs");

export async function runOperatorChecks(repository, observer = repository) {
  setRepositoryForTests(repository);
  const failures = [];
  async function check(name, work) {
    try { await work(); console.log(`PASS operator: ${name}`); }
    catch (error) { failures.push(error); console.error(`FAIL operator: ${name}: ${error.message}`); }
  }
  const created = await provisionOperator({
    subject: `security-reviewer-${randomUUID()}`,
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
  assert.equal((await getOperatorSession(authenticated.sessionToken)).subject, created.operator.subject);
  assert.equal((await requireOperatorRole(authenticated.sessionToken, "submission.review")).id, created.operator.id);
  await assert.rejects(requireOperatorRole(authenticated.sessionToken, "audit.read"), (error) => error.code === "operator-role-required");

  const credentialId = created.credential.split(".")[0];
  await check("new sessions persist their originating credential binding", async () => {
    const session = (await observer.read()).operatorSessions.find((item) => item.operatorId === created.operator.id);
    assert.equal(session.credentialId, credentialId);
    assert.equal(Date.parse(session.expiresAt) - Date.parse(session.createdAt), Number(process.env.OPERATOR_SESSION_TTL_MS || 30 * 60 * 1000));
  });
  for (const [name, mutate] of [
    ["legacy unbound session", (session) => { delete session.credentialId; }],
    ["missing credential", (session) => { session.credentialId = randomUUID(); }],
    ["wrong operator credential", (_, credential) => { credential.operatorId = randomUUID(); }],
    ["expired credential", (_, credential) => {
      credential.createdAt = new Date(Date.now() - 60_000).toISOString();
      credential.expiresAt = new Date(Date.now() - 1000).toISOString();
    }],
    ["invalid credential expiry", (_, credential) => { credential.expiresAt = "invalid"; }],
    ["empty credential expiry", (_, credential) => { credential.expiresAt = ""; }],
    ["expired session", (session) => {
      session.createdAt = new Date(Date.now() - 60_000).toISOString();
      session.expiresAt = new Date(Date.now() - 1000).toISOString();
    }],
    ["invalid session expiry", (session) => { session.expiresAt = "invalid"; }],
    ["missing session expiry", (session) => { delete session.expiresAt; }],
    ["revoked credential", (_, credential) => { credential.revokedAt = new Date().toISOString(); }],
  ]) {
    await check(`${name} fails closed on authorization`, async () => {
      const snapshot = await repository.read();
      try {
        if (repository.kind === "postgres" && ["invalid credential expiry", "invalid session expiry", "missing session expiry"].includes(name)) {
          await assert.rejects(repository.transaction((store) => mutate(
            store.operatorSessions.find((item) => item.operatorId === created.operator.id),
            store.operatorCredentials.find((item) => item.id === credentialId),
          )), (error) => ["22007", "22008", "23502"].includes(error.code));
          assert.deepEqual(await observer.read(), snapshot, "SQL projection must reject malformed expiry and roll back JSON state too");
          return;
        }
        await repository.transaction((store) => {
          const session = store.operatorSessions.find((item) => item.operatorId === created.operator.id);
          const credential = store.operatorCredentials.find((item) => item.id === credentialId);
          // Use another real operator for the PostgreSQL foreign key projection.
          if (name === "wrong operator credential") {
            const other = { ...store.operators.find((item) => item.id === created.operator.id), id: randomUUID(), subject: `other-${randomUUID()}` };
            store.operators.push(other);
            credential.operatorId = other.id;
          } else mutate(session, credential);
        });
        setRepositoryForTests(observer);
        await assert.rejects(requireOperatorRole(authenticated.sessionToken, "submission.review"), (error) => error.statusCode === 401);
        if (name.includes("credential") && !["missing credential", "wrong operator credential"].includes(name)) {
          await assert.rejects(authenticateOperatorCredential(created.credential), (error) => error.code === "operator-credential-invalid");
        }
      } finally {
        setRepositoryForTests(repository);
        await repository.transaction((store) => Object.assign(store, snapshot));
      }
    });
  }

  await check("credential revoke atomically invalidates all associated sessions only", async () => {
    const anotherSession = await authenticateOperatorCredential(created.credential);
    const independentId = randomUUID();
    const independentSecret = randomBytes(32).toString("hex");
    await repository.transaction((store) => {
      const credential = store.operatorCredentials.find((item) => item.id === credentialId);
      store.operatorCredentials.push({ ...credential, id: independentId,
        secretHash: createHash("sha256").update(independentSecret).digest("hex") });
    });
    const independent = await authenticateOperatorCredential(`${independentId}.${independentSecret}`);
    const other = await provisionOperator({ subject: `independent-${randomUUID()}`, roles: ["submission.review"] });
    const otherSession = await authenticateOperatorCredential(other.credential);
    assert.equal(await revokeOperatorCredential(credentialId), true);
    const state = await observer.read();
    const sessions = state.operatorSessions.filter((item) => item.credentialId === credentialId);
    assert.equal(sessions.length, 2);
    assert.ok(sessions.every((session) => session.revokedAt === state.operatorCredentials.find((item) => item.id === credentialId).revokedAt));
    setRepositoryForTests(observer);
    await assert.rejects(requireOperatorRole(authenticated.sessionToken, "submission.review"), (error) => error.statusCode === 401);
    await assert.rejects(requireOperatorRole(anotherSession.sessionToken, "submission.review"), (error) => error.statusCode === 401);
    assert.equal((await requireOperatorRole(independent.sessionToken, "submission.review")).id, created.operator.id);
    assert.equal((await requireOperatorRole(otherSession.sessionToken, "submission.review")).id, other.operator.id);
    setRepositoryForTests(repository);
    assert.equal(await revokeOperatorCredential(credentialId), false);
    await assert.rejects(authenticateOperatorCredential(created.credential), (error) => error.code === "operator-credential-invalid");
  });

  setRepositoryForTests(repository);
  for (const role of OPERATOR_ROLES) {
    await check(`${role} self-session revocation preserves another session and its credential`, async () => {
      setRepositoryForTests(repository);
      const identity = await provisionOperator({ subject: `logout-${role}-${randomUUID()}`, roles: [role] });
      const first = await authenticateOperatorCredential(identity.credential);
      const second = await authenticateOperatorCredential(identity.credential);
      const tokenHash = createHash("sha256").update(first.sessionToken).digest("hex");
      const before = await observer.read();
      try {
        assert.equal(await revokeOperatorSession(first.sessionToken), true);
        const after = await observer.read();
        const revoked = after.operatorSessions.find((session) => session.tokenHash === tokenHash);
        assert.ok(Number.isFinite(Date.parse(revoked.revokedAt)));
        assert.deepEqual(after.operatorSessions, before.operatorSessions.map((session) => (
          session.tokenHash === tokenHash ? { ...session, revokedAt: revoked.revokedAt } : session
        )), "only the selected session may change");
        assert.deepEqual(after.operatorCredentials, before.operatorCredentials);
        const events = after.auditLog.filter((event) => !before.auditLog.some((old) => old.id === event.id));
        assert.equal(events.length, 1);
        assert.equal(events[0].action, "operator.session_revoked");
        assert.deepEqual(events[0].actor, { kind: "operator", id: identity.operator.id });
        assert.deepEqual(events[0].detail, { operatorId: identity.operator.id });
        assert.ok(Number.isFinite(Date.parse(events[0].timestamp)));
        assert.ok(Date.parse(events[0].timestamp) >= Date.parse(revoked.revokedAt));

        setRepositoryForTests(observer);
        await assert.rejects(getOperatorSession(first.sessionToken), (error) => error.statusCode === 401 && error.code === "operator-session-invalid");
        assert.equal((await requireOperatorRole(second.sessionToken, role)).id, identity.operator.id);
        setRepositoryForTests(repository);
        assert.equal(await revokeOperatorSession(first.sessionToken), false);
        assert.deepEqual(await observer.read(), after, "repeated revocation must not add another audit event");
        const raw = JSON.stringify(after);
        for (const secret of [identity.credential, first.sessionToken, second.sessionToken]) {
          assert.equal(raw.includes(secret), false, "credentials and session tokens must not persist in plaintext");
        }
      } finally {
        setRepositoryForTests(repository);
      }
    });
  }
  await check("missing, malformed, unknown and wallet tokens cannot revoke an operator session", async () => {
    setRepositoryForTests(repository);
    const walletToken = randomBytes(32).toString("hex");
    await repository.transaction((store) => store.walletSessions.push({
      tokenHash: createHash("sha256").update(walletToken).digest("hex"),
      address: "0x1111111111111111111111111111111111111111",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      revokedAt: null,
    }));
    const snapshot = await observer.read();
    for (const token of [undefined, "", "malformed", randomBytes(32).toString("hex"), walletToken]) {
      assert.equal(await revokeOperatorSession(token), false);
      assert.deepEqual(await observer.read(), snapshot, "unmatched tokens must not change sessions or audit events");
    }
  });
  setRepositoryForTests(repository);
  await revokeOperatorCredential(credentialId);
  await assert.rejects(getOperatorSession(authenticated.sessionToken), (error) => error.code === "operator-session-invalid");
  await assert.rejects(authenticateOperatorCredential(created.credential), (error) => error.code === "operator-credential-invalid");

  const raw = JSON.stringify(await observer.read());
  assert.equal(raw.includes(created.credential), false);
  assert.equal(raw.includes(authenticated.sessionToken), false);
  if (failures.length) throw new AggregateError(failures, `${failures.length} operator regressions failed`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const repository = createRepository({ storageDriver: "file", file });
  try {
    await repository.initialize();
    await runOperatorChecks(repository);
    console.log("backend:operator-check passed (actual file store)");
  } finally {
    await repository.close();
    fs.rmSync(file, { force: true });
  }
}
