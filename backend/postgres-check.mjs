import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { migrateDatabase } from "./migrate.mjs";
import { PostgresRepository } from "./repositories/postgres.mjs";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for PostgreSQL integration checks");
await migrateDatabase();
const first = new PostgresRepository({ connectionString: process.env.DATABASE_URL });
const second = new PostgresRepository({ connectionString: process.env.DATABASE_URL });

try {
  await first.initialize();
  await second.initialize();
  await first.transaction((store) => Object.assign(store, {
    submissions: [], nonces: [], walletSessions: [], operators: [],
    operatorCredentials: [], operatorSessions: [], auditLog: [],
  }));

  await Promise.all([...Array(12)].map((_, index) => (index % 2 ? first : second).transaction((store) => {
    store.auditLog.push({
      id: randomUUID(), action: "postgres.concurrent", actor: { kind: "system", id: null },
      detail: { index }, timestamp: new Date().toISOString(),
    });
  })));
  assert.equal((await first.read()).auditLog.length, 12, "two instances must not lose concurrent writes");

  await assert.rejects(first.transaction((store) => {
    store.auditLog.push({ id: randomUUID(), action: "postgres.rollback", actor: { kind: "system", id: null }, detail: {}, timestamp: new Date().toISOString() });
    throw new Error("injected PostgreSQL rollback");
  }), /injected PostgreSQL rollback/);
  assert.equal((await second.read()).auditLog.some((event) => event.action === "postgres.rollback"), false);

  const tokenHash = "a".repeat(64);
  await first.transaction((store) => store.walletSessions.push({
    tokenHash, address: "0x1111111111111111111111111111111111111111",
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), revokedAt: null,
  }));
  assert.equal((await second.read()).walletSessions.some((session) => session.tokenHash === tokenHash), true);
  await second.transaction((store) => { store.walletSessions.find((session) => session.tokenHash === tokenHash).revokedAt = new Date().toISOString(); });
  assert.ok((await first.read()).walletSessions.find((session) => session.tokenHash === tokenHash).revokedAt);

  const publish = (id, campaign) => ({
    id, status: "published", publish: {
      transactionHash: `0x${"b".repeat(64)}`, campaignAddress: campaign,
      chainId: 97, publishedAt: new Date().toISOString(),
    },
  });
  await first.transaction((store) => store.submissions.push(publish(randomUUID(), "0x2222222222222222222222222222222222222222")));
  await assert.rejects(
    second.transaction((store) => store.submissions.push(publish(randomUUID(), "0x3333333333333333333333333333333333333333"))),
    (error) => error.code === "duplicate-record" && error.statusCode === 409,
  );
  assert.equal((await first.read()).submissions.length, 1, "duplicate publication transaction must roll back completely");
  console.log("backend:postgres-check passed");
} finally {
  await first.close();
  await second.close();
}
