# Static-analysis and dependency triage

This record separates scanner evidence from security conclusions. Automated findings
must be reviewed against the exact source and release commit. A green scanner is not
an audit, penetration test, or mainnet release approval.

## Enforcement policy

- CI fails on new high or critical dependency advisories and on high-severity Slither findings.
- Secret scanning covers the complete reachable Git history, not only the current diff.
- No finding may be excluded merely to make CI pass.
- A false-positive disposition requires a source-specific explanation and reproducible evidence.
- An accepted risk requires a named human owner, an expiry/review date, and explicit release-gate approval.
- Scanner allowlists must be narrow (rule, exact path and exact fixture where possible) and reviewed like code.
- The SARIF file and its digest belong to the release evidence bundle.

## Pinned tools

| Tool | Pinned release | CI action commit | Purpose |
| --- | --- | --- | --- |
| Slither | `0.11.6` | `crytic/slither-action@b52cc1cbfee9ca3e8722dd5224299d16c9a6b80f` (`v0.4.2`) | Solidity static analysis; High findings fail CI |
| Gitleaks | action `v3` | `gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` | Current-tree and history secret scan |
| GitHub Dependency Review | `v4.9.0` | `actions/dependency-review-action@2031cfc080254a8a887f58cffee85186f0e49e48` | Reject newly introduced High/Critical advisories |
| CodeQL | `v4.37.9` | `github/codeql-action@cdf488f595d80d6e07e03d4674febd5ab45fa938` | JavaScript/TypeScript static analysis and SARIF ingestion |
| npm audit | npm bundled with Node `20.19.0` | n/a | Whole root and frontend lockfile advisory gate |

Actions are pinned to full commits. Updating a pin requires review of the upstream
release and the new commit, followed by a clean CI run.

## Current dependency triage

The remediation changed the frontend dependency line from Next.js `16.2.9` to
`16.3.3`. The regenerated lockfile also moved security-relevant transitive packages,
including Nano ID to `3.3.18` and PostCSS to `8.5.23`.

| Advisory | Severity | Selected version evidence | Disposition |
| --- | --- | --- | --- |
| `GHSA-2xp9-vwfh-vxw4` (Next.js AVIF image optimisation RCE) | Critical | Next.js `16.3.3` is the maintainer-declared patched version | Fixed by selected direct dependency; retain audit gate |
| `GHSA-p293-qw3h-jr36` (Next.js Windows-hosted server RCE) | Critical | Next.js `16.3.3` is the maintainer-declared patched version | Fixed by selected direct dependency; retain audit gate |
| `GHSA-2v37-7h3g-55p8` (Nano ID zero-size loop) | High | Nano ID `3.3.18` is the patched 3.x floor | Fixed transitively; retain exact lockfile evidence |
| `GHSA-r28c-9q8g-f849` (PostCSS source-map path traversal) | High | PostCSS `8.5.23` is above the `8.5.18` fixed floor | Fixed transitively |
| `GHSA-fxqj-rqcc-2cmp` (PostCSS incomplete follow-up) | Moderate | PostCSS `8.5.23` is the patched floor | Fixed transitively |

This targeted review is not a substitute for scanning the complete lock trees. The
release gate requires fresh root and frontend `npm audit --audit-level=high` results
and a passing Dependency Review check at the exact final commit.

## Finding register

Populate this table from the first exact-head run. Do not create suppressions before
the underlying output is available.

| Date | Release commit | Tool/rule or advisory | Severity | Source location/dependency path | Disposition | Evidence and owner | Review/expiry |
| --- | --- | --- | --- | --- | --- | --- | --- |
| _pending exact-head run_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |

For every run, record the exact command, tool version, SARIF/report digest, and whether
the scan covered the working tree, the pull-request diff, or Git history.
