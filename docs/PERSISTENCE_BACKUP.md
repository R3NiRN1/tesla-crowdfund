# Persistence, Backup, And Migration Readiness

TES Crowdfund currently uses a file-backed JSON backend store. This is launch-alpha persistence, not a highly available production database. Operators must rehearse backup and restore before any public launch.

## Store Location

Default store:

```text
backend/data/backend-alpha-store.json
```

Override it for deploys or rehearsals:

```bash
TESLA_CROWDFUND_BACKEND_DB=/var/lib/tes-crowdfund/backend-store.json npm run backend:dev
```

The store contains:

- submissions, including draft, review, verification, approved, published, rejected, and needs-changes states
- publish records inside published submissions
- media references and metadata URI references
- creator updates
- auth nonces
- backend audit log

Runtime env and deployment config are not restored from the JSON store. Back up root `.env`, frontend env, deployed contract addresses, release commit SHA, and hosting configuration separately. Never put private keys into a backend store backup.

## Commands

Validate the active store:

```bash
npm run backend:store:check
```

Write a timestamped backup under `backend/data/backups`:

```bash
npm run backend:backup
```

Write a backup to a specific path:

```bash
npm run backend:backup -- ./ops/backups/backend-store-rehearsal.json
```

Validate a backup file before restore:

```bash
npm run backend:store:check -- ./ops/backups/backend-store-rehearsal.json
```

Restore from a backup or raw store JSON file:

```bash
npm run backend:restore -- ./ops/backups/backend-store-rehearsal.json
```

Restore writes a `pre-restore-*` safety copy of the current active store before replacing it.

## Backup Discipline

Take a backup:

1. Before deploys.
2. Before admin bulk review sessions.
3. Before importing migrated data.
4. After a successful creator wallet publish record is accepted.
5. Before rollback.
6. At the end of every launch rehearsal.

Store at least one copy outside the app host. Treat backups as sensitive operational data because they contain creator addresses, campaign metadata, review notes, and audit history.

## Restore Rehearsal

1. Stop the backend.
2. Copy the backup to the target host.
3. Set `TESLA_CROWDFUND_BACKEND_DB` to the intended store path.
4. Run `npm run backend:store:check -- <backup-file>`.
5. Run `npm run backend:restore -- <backup-file>`.
6. Start the backend.
7. Open `/health` and `/admin/diagnostics`.
8. Confirm submission counts, published counts, media references, and audit events match the backup summary.
9. Open the public campaign list and confirm published records are visible.
10. Record the restore timestamp, backup file, release commit, and operator.

## Migration Notes

The current schema is `version: 1`. The next persistence step should migrate to durable storage with explicit tables or collections for:

- submissions
- publish records
- media references
- campaign updates
- audit events
- auth nonces
- operator/release metadata

Before migration, export the JSON store, run `backend:store:check`, import into the target storage in a staging environment, and compare counts plus representative records. Keep the JSON backup until the new storage has passed at least one restore rehearsal.

## Data-Loss Warnings

- Deleting `backend/data/backend-alpha-store.json` deletes backend submission truth.
- Browser localStorage cannot recover backend submissions, audit events, or publish records.
- Published contract state remains on-chain, but backend public listing evidence can be lost without a store backup.
- Restore replaces the active backend store; validate the target and backup path before running it.
- The backend still does not custody funds or private keys. Contract deployment keys and env files must be backed up through separate secure operator processes.
