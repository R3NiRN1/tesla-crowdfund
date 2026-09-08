# Backend persistence boundary

The backend exposes one asynchronous repository contract with two adapters:

- `file` is retained for local development and deterministic tests. Writes are serialized within one process and committed by unique temporary-file rename. It is not a production or multi-process adapter.
- `postgres` is the production-capable provider-neutral adapter. It is selected with `STORAGE_DRIVER=postgres` and `DATABASE_URL` and uses transactions plus a locked singleton state row to prevent lost updates across instances. Separate constrained tables enforce unique challenges, hashed sessions, publication transaction/campaign identity, named operators, roles and append-only audit events.

Production startup fails before listening unless PostgreSQL is configured, migrations are present, and an active review operator exists. Apply reproducible migrations explicitly:

```text
npm run backend:migrate
npm run backend:postgres:check
```

The migration runner takes a PostgreSQL advisory lock, records SHA-256 checksums, and rejects checksum drift. It does not silently migrate at application startup.

Existing local JSON data is not automatically imported into production. Validate and retain an encrypted backup before any one-time migration. A hosting decision must still define PostgreSQL TLS/CA settings, connection pooling, encrypted backups/PITR, monitoring and restore drills; this repository intentionally does not select a commercial database vendor.

Wallet and operator session tokens are returned once to the caller but only SHA-256 hashes are persisted. Expiry and revocation are checked from the repository on every request, so they are visible across backend processes.
