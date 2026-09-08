import pg from "pg";

import { emptyStore, normalizeStore } from "../persistence.mjs";

const { Pool } = pg;

function configError(message) {
  return Object.assign(new Error(message), { code: "postgres-configuration-error" });
}

export class PostgresRepository {
  constructor({ connectionString, pool } = {}) {
    if (!pool && !connectionString) throw configError("DATABASE_URL is required for PostgreSQL storage");
    this.pool = pool || new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_SIZE || 10) });
    this.kind = "postgres";
    this.durable = true;
  }

  async initialize() {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT 1 FROM backend_schema_migrations LIMIT 1");
      await client.query(
        "INSERT INTO backend_state (singleton, document) VALUES (true, $1::jsonb) ON CONFLICT (singleton) DO NOTHING",
        [JSON.stringify(emptyStore())],
      );
    } catch (error) {
      if (error.code === "42P01") {
        throw Object.assign(new Error("database migrations are not applied; run npm run backend:migrate"), {
          code: "database-migrations-required",
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }

  async read() {
    const result = await this.pool.query("SELECT document FROM backend_state WHERE singleton = true");
    return normalizeStore(result.rows[0]?.document || emptyStore());
  }

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query("SELECT document FROM backend_state WHERE singleton = true FOR UPDATE");
      const state = normalizeStore(current.rows[0]?.document || emptyStore());
      const result = await work(state);
      await client.query("UPDATE backend_state SET document = $1::jsonb, updated_at = clock_timestamp() WHERE singleton = true", [JSON.stringify(normalizeStore(state))]);
      await this.syncConstraints(client, state);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") {
        throw Object.assign(new Error("duplicate durable backend record"), { code: "duplicate-record", statusCode: 409 });
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async syncConstraints(client, state) {
    await client.query("DELETE FROM backend_challenges");
    for (const record of state.nonces) {
      await client.query(
        `INSERT INTO backend_challenges (id, address, nonce, expires_at, consumed_at)
         VALUES ($1::uuid, $2, $3::uuid, $4::timestamptz, $5::timestamptz)`,
        [record.id, record.address, record.nonce, record.expiresAt, record.usedAt || record.invalidatedAt || null],
      );
    }

    await client.query("DELETE FROM backend_wallet_sessions");
    for (const record of state.walletSessions) {
      await client.query(
        `INSERT INTO backend_wallet_sessions (token_hash, address, created_at, expires_at, revoked_at)
         VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5::timestamptz)`,
        [record.tokenHash, record.address, record.createdAt, record.expiresAt, record.revokedAt || null],
      );
    }

    await client.query("DELETE FROM backend_publications");
    for (const submission of state.submissions.filter((item) => item.publish)) {
      await client.query(
        `INSERT INTO backend_publications (submission_id, chain_id, transaction_hash, campaign_address)
         VALUES ($1::uuid, $2, lower($3), lower($4))`,
        [submission.id, submission.publish.chainId, submission.publish.transactionHash, submission.publish.campaignAddress],
      );
    }

    await client.query("DELETE FROM backend_operator_sessions");
    await client.query("DELETE FROM backend_operator_credentials");
    await client.query("DELETE FROM backend_operator_roles");
    await client.query("DELETE FROM backend_operators");
    for (const operator of state.operators) {
      await client.query(
        "INSERT INTO backend_operators (id, subject, display_name, active, created_at) VALUES ($1::uuid, $2, $3, $4, $5::timestamptz)",
        [operator.id, operator.subject, operator.displayName, operator.active !== false, operator.createdAt],
      );
      for (const role of operator.roles || []) {
        await client.query("INSERT INTO backend_operator_roles (operator_id, role) VALUES ($1::uuid, $2)", [operator.id, role]);
      }
    }
    for (const credential of state.operatorCredentials) {
      await client.query(
        `INSERT INTO backend_operator_credentials (id, operator_id, secret_hash, created_at, expires_at, revoked_at)
         VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz, $5::timestamptz, $6::timestamptz)`,
        [credential.id, credential.operatorId, credential.secretHash, credential.createdAt, credential.expiresAt || null, credential.revokedAt || null],
      );
    }
    for (const session of state.operatorSessions) {
      await client.query(
        `INSERT INTO backend_operator_sessions (token_hash, operator_id, created_at, expires_at, revoked_at)
         VALUES ($1, $2::uuid, $3::timestamptz, $4::timestamptz, $5::timestamptz)`,
        [session.tokenHash, session.operatorId, session.createdAt, session.expiresAt, session.revokedAt || null],
      );
    }

    const knownAudit = await client.query("SELECT id::text FROM backend_audit_events");
    const known = new Set(knownAudit.rows.map((row) => row.id));
    for (const entry of state.auditLog) {
      if (known.has(entry.id)) continue;
      await client.query(
        `INSERT INTO backend_audit_events (id, action, actor_kind, actor_id, detail, occurred_at)
         VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6::timestamptz)`,
        [entry.id, entry.action, entry.actor?.kind || "system", entry.actor?.id || null, JSON.stringify(entry.detail || {}), entry.timestamp],
      );
    }
  }
}
