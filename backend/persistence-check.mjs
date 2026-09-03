import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FileRepository } from "./repositories/file.mjs";

const file = path.join(os.tmpdir(), `tesla-crowdfund-persistence-${Date.now()}.json`);

try {
  const first = new FileRepository({ file });
  await first.initialize();
  await first.transaction((store) => {
    store.auditLog.push({ id: "first", action: "restart.seed", actor: { kind: "system", id: null }, detail: {}, timestamp: new Date().toISOString() });
  });

  const restarted = new FileRepository({ file });
  assert.equal((await restarted.read()).auditLog.length, 1, "state must survive adapter restart");

  await Promise.all([...Array(20)].map((_, index) => restarted.transaction(async (store) => {
    await new Promise((resolve) => setImmediate(resolve));
    store.auditLog.push({ id: `concurrent-${index}`, action: "concurrency.write", actor: { kind: "system", id: null }, detail: { index }, timestamp: new Date().toISOString() });
  })));
  assert.equal((await restarted.read()).auditLog.length, 21, "serialized local transactions must not lose writes");

  await assert.rejects(
    restarted.transaction((store) => {
      store.auditLog.push({ id: "rollback", action: "rollback.failure", actor: { kind: "system", id: null }, detail: {}, timestamp: new Date().toISOString() });
      throw new Error("injected rollback");
    }),
    /injected rollback/,
  );
  assert.equal((await restarted.read()).auditLog.some((entry) => entry.id === "rollback"), false);

  const persisted = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(JSON.stringify(persisted).includes("sessionToken"), false, "plaintext session fields must never be persisted");
  console.log("backend:persistence-check passed");
} finally {
  fs.rmSync(file, { force: true });
}
