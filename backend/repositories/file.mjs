import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { emptyStore, getBackendDbFile, normalizeStore } from "../persistence.mjs";

function clone(value) {
  return structuredClone(value);
}

export class FileRepository {
  constructor({ file } = {}) {
    this.file = file || getBackendDbFile();
    this.kind = "file";
    this.durable = false;
    this.queue = Promise.resolve();
  }

  async initialize() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
  }

  async close() {}

  async read() {
    await this.queue;
    if (!fs.existsSync(this.file)) return emptyStore();
    try {
      return normalizeStore(JSON.parse(fs.readFileSync(this.file, "utf8")));
    } catch (error) {
      throw new Error(`Failed to read local backend store: ${error.message}`);
    }
  }

  async transaction(work) {
    const run = async () => {
      const state = clone(await this.readUnlocked());
      const result = await work(state);
      this.writeUnlocked(state);
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  readUnlocked() {
    if (!fs.existsSync(this.file)) return emptyStore();
    return normalizeStore(JSON.parse(fs.readFileSync(this.file, "utf8")));
  }

  writeUnlocked(state) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const normalized = normalizeStore(state);
    const tmp = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}
