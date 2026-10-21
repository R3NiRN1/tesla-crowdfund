import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { Client } from "pg";
import { LocalPostgres } from "./lib/local-postgres.mjs";

const fixtureDirectories = [];
after(async () => {
  for (const directory of fixtureDirectories) {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("tes-local-pg-check-"));
    await rm(directory, { recursive: true, force: true });
  }
});

function fixture(execute = async () => {}, ClientType) {
  const controller = new AbortController();
  const temporary = mkdtempSync(path.join(tmpdir(), "tes-local-pg-check-"));
  fixtureDirectories.push(temporary);
  const config = {
    binaries: { initdb: path.resolve("fixture/initdb"), pg_ctl: path.resolve("fixture/pg_ctl") },
    databaseDir: path.join(temporary, "data"), user: "tes_local", password: "fixture-password", port: 54321,
    signal: controller.signal, env: { PATH: "fixture-path" },
  };
  const calls = [];
  const database = new LocalPostgres(config, {
    execute: async (...args) => { calls.push(args); return execute(...args); },
    ...(ClientType ? { Client: ClientType } : {}),
  });
  return { database, config, calls, controller };
}

async function provision(value) {
  await value.database.initialise();
  value.calls.length = 0;
  return value;
}

test("already-dead status returns without stop, even with an aborted provisioning signal", async () => {
  const { database, calls, controller } = await provision(fixture(async (_, args) => {
    if (args.at(-1) === "status") throw Object.assign(new Error("not running"), { code: 3 });
  }));
  controller.abort();
  await database.stop();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].at(-1), "status");
  assert.equal(calls[0][2].timeout, 5000);
  assert.equal("signal" in calls[0][2], false);
});

test("normal shutdown uses fast mode and finite command bounds", async () => {
  const { database, calls } = await provision(fixture());
  await database.stop();
  assert.deepEqual(calls[1][1].slice(2), ["-w", "-t", "15", "-m", "fast", "stop"]);
  assert.equal(calls.length, 2);
  for (const [, , options] of calls) {
    assert.ok(options.timeout > 0 && options.timeout <= 20000);
    assert.equal(options.windowsHide, true);
    assert.equal(options.killSignal, "SIGKILL");
    assert.equal("signal" in options, false);
  }
});

test("fast timeout performs immediate cleanup but reports degraded failure, without aborted signal", async () => {
  const fast = Object.assign(new Error("timeout"), { killed: true });
  const { database, calls, controller } = await provision(fixture(async (_, args) => { if (args.includes("fast")) throw fast; }));
  controller.abort();
  await assert.rejects(database.stop(), (error) => /required immediate shutdown/.test(error.message) && error.cause === fast);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2][1].slice(2), ["-w", "-t", "5", "-m", "immediate", "stop"]);
  assert.equal(calls[2][2].timeout, 10000);
  assert.ok(calls.every(([, , options]) => !("signal" in options)));
});

test("both shutdown failures are surfaced with bounded attempts", async () => {
  const errors = [new Error("fast failure"), new Error("immediate failure")];
  const { database, calls } = await provision(fixture(async (_, args) => {
    if (args.includes("fast")) throw errors[0];
    if (args.includes("immediate")) throw errors[1];
  }));
  await assert.rejects(database.stop(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, errors);
    return true;
  });
  assert.deepEqual(calls.map(([, , options]) => options.timeout), [5000, 20000, 10000]);
});

test("unexpected status failure is not treated as an already-dead server", async () => {
  const failure = Object.assign(new Error("bad directory"), { code: 4 });
  const { database, calls } = await provision(fixture(async (_, args) => { if (args.at(-1) === "status") throw failure; }));
  await assert.rejects(database.stop(), (error) => error === failure);
  assert.equal(calls.length, 1);
});

for (const outcome of ["success", "failure", "abort"]) {
  test("initdb removes its private password file after " + outcome, async () => {
    let passwordFile;
    const failure = new Error("injected " + outcome);
    const { database, config, controller } = fixture(async (binary, args, options) => {
      assert.equal(binary, config.binaries.initdb);
      passwordFile = args.find((value) => value.startsWith("--pwfile=")).slice("--pwfile=".length);
      assert.equal(await readFile(passwordFile, "utf8"), config.password + "\n");
      if (process.platform !== "win32") assert.equal((await stat(passwordFile)).mode & 0o777, 0o600);
      assert.equal(args.some((value) => value.includes(config.password)), false);
      assert.equal(options.signal, controller.signal);
      assert.equal(options.timeout, 60000);
      assert.deepEqual(options.env, config.env);
      if (outcome === "abort") controller.abort();
      if (outcome !== "success") throw failure;
    });
    if (outcome === "success") await database.initialise();
    else await assert.rejects(database.initialise(), (error) => error === failure);
    await assert.rejects(stat(passwordFile), { code: "ENOENT" });
    await assert.rejects(stat(path.dirname(passwordFile)), { code: "ENOENT" });
  });
}

test("start binds loopback, logs to a file, waits with a finite deadline and forwards abort", async () => {
  const { database, config, calls, controller } = await provision(fixture());
  await database.start();
  assert.deepEqual(calls[0][1], [
    "-D", config.databaseDir, "-w", "-t", "15", "-l", path.join(config.databaseDir, "postgres.log"),
    "-o", "-h 127.0.0.1 -p 54321", "start",
  ]);
  assert.equal(calls[0][2].timeout, 20000);
  assert.equal(calls[0][2].signal, controller.signal);
  assert.deepEqual(calls[0][2].env, { PATH: "fixture-path" });
});

test("client configuration isolates ambient PG settings and closes on query failure", async () => {
  const injected = { PGOPTIONS: "-c default_transaction_read_only=on", PGSSLMODE: "require", PGSSLNEGOTIATION: "direct", PGHOST: "unrelated-host" };
  const saved = Object.fromEntries(Object.keys(injected).map((key) => [key, process.env[key]]));
  let client;
  let ended = false;
  const failure = new Error("query failed");
  class ProbeClient extends Client {
    constructor(config) { super(config); client = this; }
    async connect() {}
    async query(sql) { assert.equal(sql, 'CREATE DATABASE "tes_restore"'); throw failure; }
    async end() { ended = true; }
  }
  try {
    Object.assign(process.env, injected);
    const { database } = fixture(undefined, ProbeClient);
    await assert.rejects(database.createDatabase("tes_restore"), (error) => error === failure);
    assert.equal(client.connectionParameters.host, "127.0.0.1");
    assert.equal(client.connectionParameters.port, 54321);
    assert.equal(client.connectionParameters.ssl, false);
    assert.ok(!client.connectionParameters.options);
    assert.equal(client.connectionParameters.query_timeout, 15000);
    assert.equal(client.connectionParameters.connect_timeout, 5);
    assert.equal(ended, true);
    for (const [key, value] of Object.entries(injected)) assert.equal(process.env[key], value);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("database identifier validation rejects unsafe or oversized names before creating clients", async () => {
  let constructed = 0;
  class UnexpectedClient { constructor() { constructed++; } }
  const { database } = fixture(undefined, UnexpectedClient);
  for (const name of ["", "a; DROP DATABASE postgres", 'bad"name', "a".repeat(64), "has space", "1invalid", "trailing\n", null]) {
    await assert.rejects(database.createDatabase(name), /identifier/);
  }
  assert.equal(constructed, 0);
});

test("aborted provisioning avoids client construction and initdb execution", async () => {
  let constructed = 0;
  class UnexpectedClient { constructor() { constructed++; } }
  const { database, controller, calls } = fixture(undefined, UnexpectedClient);
  controller.abort();
  await assert.rejects(database.initialise(), { name: "AbortError" });
  await assert.rejects(database.createDatabase("tes_app"), { name: "AbortError" });
  assert.equal(constructed, 0);
  assert.equal(calls.length, 0);
});

test("real executor kills a stalled command at its deadline", { timeout: 20000 }, async () => {
  const { config } = fixture();
  const database = new LocalPostgres(config);
  await assert.rejects(
    database.command(process.execPath, ["-e", "setInterval(() => {}, 1000)"], 100, false),
    (error) => error.killed === true,
  );
});

test("unowned directories are never started or stopped, and existing paths are refused", async () => {
  const { database, config, calls } = fixture();
  await mkdir(config.databaseDir);
  await assert.rejects(database.initialise(), { code: "EEXIST" });
  await assert.rejects(database.start(), /initialized by this instance/);
  await database.stop();
  assert.equal(calls.length, 0);
});

test("status 4 is harmless only when owned directory initialization never completed", async () => {
  const { database, calls } = fixture(async (_, args) => {
    if (args.at(-1) === "status") throw Object.assign(new Error("inaccessible directory"), { code: 4 });
    throw new Error("initialization failed");
  });
  await assert.rejects(database.initialise(), /initialization failed/);
  calls.length = 0;
  await database.stop();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].at(-1), "status");
});

test("client constructor failure restores inherited configuration", async () => {
  const saved = process.env.PGOPTIONS;
  const failure = new Error("constructor failed");
  class BrokenClient { constructor() { throw failure; } }
  try {
    process.env.PGOPTIONS = "fixture-sentinel";
    const { database } = fixture(undefined, BrokenClient);
    await assert.rejects(database.createDatabase("tes_app"), (error) => error === failure);
    assert.equal(process.env.PGOPTIONS, "fixture-sentinel");
  } finally {
    if (saved === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = saved;
  }
});
