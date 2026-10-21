import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { Client as PgClient } from "pg";

const executeFile = promisify(execFile);
const identifier = /^[a-z_][a-z0-9_]{0,62}$/i;

function validateIdentifier(value) {
  if (typeof value !== "string" || value.trim() !== value || !identifier.test(value)) throw new Error("Invalid local database identifier");
}

export class LocalPostgres {
  #owned = false;
  #initialized = false;

  constructor({ binaries, databaseDir, user, password, port, signal, env }, { execute = executeFile, Client = PgClient } = {}) {
    if (!binaries || ![binaries.initdb, binaries.pg_ctl, databaseDir].every((value) => typeof value === "string" && path.isAbsolute(value))) {
      throw new Error("Absolute PostgreSQL binary and database paths are required");
    }
    validateIdentifier(user);
    if (typeof password !== "string" || !password || /[\r\n\0]/.test(password)) throw new Error("Invalid local database password");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local database port");
    if (!env || typeof env !== "object" || Array.isArray(env)) throw new Error("Explicit sanitized environment is required");
    Object.assign(this, { binaries: { ...binaries }, databaseDir, user, password, port, signal, env: { ...env }, execute, Client });
  }

  command(binary, args, timeout, provisioning = true) {
    return this.execute(binary, args, {
      env: this.env, windowsHide: true, timeout, killSignal: "SIGKILL", maxBuffer: 1024 * 1024,
      ...(provisioning && this.signal ? { signal: this.signal } : {}),
    });
  }

  async initialise() {
    this.signal?.throwIfAborted();
    // Refuse existing directories so cleanup can only address this instance's cluster.
    await mkdir(this.databaseDir);
    this.#owned = true;
    const temporary = await mkdtemp(path.join(tmpdir(), "tes-local-postgres-"));
    const passwordFile = path.join(temporary, "password");
    try {
      await writeFile(passwordFile, this.password + "\n", { mode: 0o600, flag: "wx" });
      await this.command(this.binaries.initdb, [
        "-D", this.databaseDir, "--username=" + this.user, "--pwfile=" + passwordFile,
        "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C",
      ], 60000);
      this.#initialized = true;
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  async start() {
    if (!this.#initialized) throw new Error("Local PostgreSQL must be initialized by this instance before starting");
    await this.command(this.binaries.pg_ctl, [
      "-D", this.databaseDir, "-w", "-t", "15", "-l", path.join(this.databaseDir, "postgres.log"),
      "-o", "-h 127.0.0.1 -p " + this.port, "start",
    ], 20000);
  }

  async createDatabase(name) {
    validateIdentifier(name);
    this.signal?.throwIfAborted();
    // pg resolves PG* defaults synchronously, including options: "". Restore before any await.
    const inherited = Object.entries(process.env).filter(([key]) => /^PG/i.test(key));
    let client;
    try {
      for (const [key] of inherited) delete process.env[key];
      client = new this.Client({
        host: "127.0.0.1", port: this.port, user: this.user, password: this.password, database: "postgres",
        ssl: false, options: "", connectionTimeoutMillis: 5000, query_timeout: 15000, statement_timeout: 15000,
      });
    } finally {
      for (const [key, value] of inherited) process.env[key] = value;
    }
    // Idle connection errors must not become uncaught process errors.
    client.on("error", () => {});
    try {
      await client.connect();
      await client.query('CREATE DATABASE "' + name + '"');
    } finally {
      await client.end();
    }
  }

  async stop() {
    if (!this.#owned) return;
    const args = ["-D", this.databaseDir];
    try {
      await this.command(this.binaries.pg_ctl, [...args, "status"], 5000, false);
    } catch (error) {
      if (error.code === 3 || (error.code === 4 && !this.#initialized)) return;
      throw error;
    }
    try {
      await this.command(this.binaries.pg_ctl, [...args, "-w", "-t", "15", "-m", "fast", "stop"], 20000, false);
    } catch (fastError) {
      try {
        await this.command(this.binaries.pg_ctl, [...args, "-w", "-t", "5", "-m", "immediate", "stop"], 10000, false);
      } catch (immediateError) {
        throw new AggregateError([fastError, immediateError], "Local PostgreSQL shutdown failed");
      }
      throw new Error("Local PostgreSQL required immediate shutdown after fast shutdown failed", { cause: fastError });
    }
  }
}
