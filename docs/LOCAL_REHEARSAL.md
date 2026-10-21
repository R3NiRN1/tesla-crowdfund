# Automated local launch rehearsal

Run from the repository root after the standard root npm ci:

    npm run test:local

The command installs a separately locked PostgreSQL 16 support package, compiles
the candidate and provisions its own local PostgreSQL cluster and Hardhat chain.
No Docker installation, database setup, operator credential preparation, wallet
creation, faucet funding or manually configured environment file is required.

It creates six distinct ephemeral signers, funds them only on chain 31337,
deploys MockTES and V2, provisions named review/read-only operators and starts a
production-guarded backend against PostgreSQL. Client signers stay in the test
driver; the backend receives no signing keys.

## Checks

- PostgreSQL migrations, concurrent instances, rollback and durable session behavior.
- V2 identity and six separate client-side signer roles.
- Backend health, named operator roles and denial of creator/operator impersonation.
- Creator readiness, ownership, needs-changes, resubmission and operator approval.
- Creator-wallet publication and independent receipt verification through the API.
- Public listing, multiple backers, capped approval and excess remaining in the wallet.
- Sequential evidence review, outsider vote denial, challenge, arbitration rejection,
  pro-rata refunds, terminal escrow conservation and double-refund denial.
- Session and listing survival across backend restart.
- Logical snapshot backup/restore into a separate recovery database.

Services use automatically selected loopback ports. PostgreSQL data and evidence
remain in ignored .local-rehearsal directories; services are stopped at the end.
A failed assertion exits nonzero. The --fail-after-provision option deliberately
tests failure propagation and teardown; it must exit 1.

The fixture backend explicitly binds BACKEND_HOST=127.0.0.1; the backend's
existing default interface behavior is unchanged for other deployments.
BACKEND_HOST accepts an explicit IPv4 or IPv6 bind address, not a URL.
Child processes inherit only allowlisted operating-system environment entries
plus their explicit local fixture configuration, not unrelated signing keys,
database URLs, access tokens or Node startup options.

Six built-in Node regression tests run before provisioning. They cover environment
isolation, immediate process exit, forced shutdown, shutdown failure, failed spawn
and cleanup continuation. A child that ignores termination is forcibly stopped;
failure to stop is reported. Cleanup attempts every resource, and any cleanup error
marks the run FAIL instead of being swallowed. HTTP probes and API requests have
explicit timeouts. These checks do not constitute a general application audit.

## Evidence and scope

Each run writes an ignored evidence.json containing the commit, dirty-tree flag,
public test addresses, transaction identity and actual checks. Its companion
private-backup.json includes backend session hashes and audit records and must
remain private. Raw signer keys, database passwords and operator credentials are
not written to the evidence bundle.

This is an API/contract/local-infrastructure rehearsal, not a browser-wallet test,
public BSC deployment, physical-world evidence review or production hosting setup.
Local time travel is restricted to chain 31337 and does not complete the live BSC
7/14/30-day review, arbitration or inactivity windows.

Use docs/BSC_TESTNET_RUNBOOK.md for a separately authorized chain-97 rehearsal.
Shared test launch remains gated by the full dependency audit, human review and
the designated test-host evidence. This command cannot approve or deploy a release.
See [current readiness](FIRST_ROUND_TEST_READINESS_2026-10-21.md) and the
[independent review handoff](security/REVIEW_HANDOFF.md) for evidence and open gates.
