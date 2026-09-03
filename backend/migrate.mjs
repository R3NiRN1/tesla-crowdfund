import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrateDatabase({ connectionString = process.env.DATABASE_URL, pool } = {}) {
  if (!pool && !connectionString) throw new Error("DATABASE_URL is required");
  const ownedPool = pool || new Pool({ connectionString, max: 1 });
  const client = await ownedPool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [747465730]);
    const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
    for (const name of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const tableExists = await client.query("SELECT to_regclass('public.backend_schema_migrations') AS name");
      if (tableExists.rows[0].name) {
        const applied = await client.query("SELECT checksum FROM backend_schema_migrations WHERE name = $1", [name]);
        if (applied.rowCount) {
          if (applied.rows[0].checksum !== checksum) throw new Error(`migration checksum changed: ${name}`);
          continue;
        }
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO backend_schema_migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
          [name, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [747465730]).catch(() => {});
    client.release();
    if (!pool) await ownedPool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await migrateDatabase();
  console.log("backend migrations applied");
}
