import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { cleanupLocalResources, localChildEnv, registerLocalTermination, stopChild } from "./lib/local-process.mjs";

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
test("termination aborts work and runs cleanup exactly once before exiting", async () => {
  const events = new EventEmitter();
  const controller = new AbortController();
  const calls = [];
  let finish;
  const exited = new Promise((resolve) => { finish = resolve; });
  const remove = registerLocalTermination({
    events, abort: () => controller.abort(),
    onSignal: (signal) => calls.push(signal),
    cleanup: async () => { calls.push("cleanup"); },
    exit: (code) => { calls.push(code); finish(); },
  });
  events.emit("SIGTERM");
  events.emit("SIGINT");
  await exited;
  assert.equal(controller.signal.aborted, true);
  assert.deepEqual(calls, ["SIGTERM", "cleanup", 143]);
  remove();
  assert.equal(events.listenerCount("SIGTERM"), 0);
  assert.equal(events.listenerCount("SIGINT"), 0);
});

test("termination reports cleanup rejection as failure", async () => {
  const events = new EventEmitter();
  let finish;
  const exited = new Promise((resolve) => { finish = resolve; });
  const remove = registerLocalTermination({
    events, abort: () => {}, onSignal: () => {},
    cleanup: async () => { throw new Error("cleanup failed"); },
    exit: finish,
  });
  events.emit("SIGINT");
  assert.equal(await exited, 1);
  remove();
});

test("POSIX parent-targeted SIGTERM reaps both owned children", {
  skip: process.platform === "win32", timeout: 15000,
}, async () => {
  const code = `
    import { spawn } from "node:child_process";
    import { registerLocalTermination, stopChild } from "./scripts/lib/local-process.mjs";
    const children = [0,1].map(() => spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {stdio:"ignore"}));
    registerLocalTermination({
      onSignal: () => {}, abort: () => {},
      cleanup: async () => { for(const child of children) await stopChild(child); },
    });
    process.send(children.map(child => child.pid));
    setInterval(()=>{},1000);
  `;
  const parent = spawn(process.execPath, ["--input-type=module", "-e", code], {
    cwd: new URL("../", import.meta.url), env: localChildEnv(),
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  let pids = [];
  try {
    [pids] = await once(parent, "message", { signal: AbortSignal.timeout(5000) });
    const exited = once(parent, "exit", { signal: AbortSignal.timeout(7000) });
    parent.kill("SIGTERM");
    const [exitCode] = await exited;
    assert.equal(exitCode, 143);
    for (const pid of pids) {
      assert.throws(() => process.kill(pid, 0), (error) => error.code === "ESRCH");
    }
  } finally {
    if (parent.exitCode === null && !parent.signalCode) parent.kill("SIGKILL");
    for (const pid of pids) {
      try { process.kill(pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
  }
});
