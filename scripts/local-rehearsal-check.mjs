import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { cleanupLocalResources, localChildEnv, stopChild } from "./lib/local-process.mjs";

test("local children receive only operating-system context and explicit fixture configuration", () => {
  const env = localChildEnv({ DATABASE_URL: "local-fixture" }, {
    Path: "system-path", SystemRoot: "system-root", HOME: "/home/test",
    DEPLOYER_PRIVATE_KEY: "not-for-backend", DATABASE_URL: "production-database",
    NODE_OPTIONS: "--import=untrusted", BACKEND_ADMIN_TOKEN: "unrelated-secret", GITHUB_TOKEN: "secret",
  });
  assert.deepEqual(env, { Path: "system-path", SystemRoot: "system-root", HOME: "/home/test", DATABASE_URL: "local-fixture" });
});

function fixture(onKill = () => {}) {
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, signals: [] });
  child.kill = (signal) => { child.signals.push(signal); onKill(child, signal); return true; };
  return child;
}

test("shutdown observes immediate exit without waiting for its timeout", async () => {
  const child = fixture((value) => { value.exitCode = 0; value.emit("exit", 0); });
  await stopChild(child, { graceMs: 10, forceMs: 10 });
  assert.deepEqual(child.signals, ["SIGTERM"]);
  assert.equal(child.listenerCount("exit"), 0);
});

test("shutdown escalates a child ignoring normal termination", async () => {
  const child = fixture((value, signal) => {
    if (signal === "SIGKILL") { value.signalCode = signal; value.emit("exit", null, signal); }
  });
  await stopChild(child, { graceMs: 10, forceMs: 10 });
  assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(child.listenerCount("exit"), 0);
});

test("an unkillable child reports failure instead of hanging or succeeding", async () => {
  const child = fixture();
  await assert.rejects(stopChild(child, { graceMs: 10, forceMs: 10 }), /forced shutdown/);
  assert.equal(child.listenerCount("exit"), 0);
});

test("failed spawn and already-exited child do not wait for an impossible exit", async () => {
  for (const child of [
    Object.assign(fixture(), { spawnError: new Error("spawn failed") }),
    Object.assign(fixture(), { exitCode: 1 }),
  ]) {
    await stopChild(child);
    assert.deepEqual(child.signals, []);
  }
});

test("cleanup attempts every resource and records each failure", async () => {
  const closed = [];
  const failures = await cleanupLocalResources([
    { name: "child", close: async () => { closed.push("child"); throw new Error("child failed"); } },
    { name: "repository", close: async () => { closed.push("repository"); } },
    { name: "database", close: async () => { closed.push("database"); throw new Error("database failed"); } },
  ]);
  assert.deepEqual(closed, ["child", "repository", "database"]);
  assert.deepEqual(failures, [{ name: "child", message: "child failed" }, { name: "database", message: "database failed" }]);
});
