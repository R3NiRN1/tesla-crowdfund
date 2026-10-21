# Lint dependency repair

## Scope

The full frontend audit was blocked by the unpatched
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) through
eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch.

The pinned Next 16.3.8 plugin uses fast-glob at one site only: finding optional
project roots for no-html-link-for-pages. This repository is a single frontend
and does not require glob-based project discovery.

The repository-owned package in frontend/tools/next-root-glob is named
@tesla/next-root-directories. It has no dependencies and implements only the
reviewed directory lookup with Node's filesystem API. The fast-glob dependency
name is retained as a local npm alias so the unchanged upstream plugin can load
it; it is not the registry fast-glob implementation or a patched copy of braces.

## Configuration contract

The repository pins its actual frontend directory explicitly, equivalent to the
previous npm lint working directory. A regression checks that effective config.
The upstream default still works. Explicit rootDir settings must name existing
directories, or an array of such directories:

    settings: {
      next: {
        rootDir: ["apps/creator", "apps/backer"]
      }
    }

Relative/absolute roots, spaces, explicit hidden directories, directory symlinks
and the host filesystem's case behavior are supported. Missing roots, file paths
and unsupported API options fail loudly. Glob-style project discovery is
intentionally unsupported: use explicit directory arrays, not apps/* or brace
patterns. Such directory/API failures fail lint rather than silently skipping a rule.

Upstream still ignores non-string array entries and bypasses lookup for an empty
array. This repository's effective-config guard requires its one explicit frontend
root, so those settings fail the pre-lint regression check here. Arbitrary external
ESLint configurations are outside this guarantee.

No Next/React/TypeScript rule is disabled by this change. The existing
eslint-config-next version and rule configuration remain in place.

## Installation and update guard

The direct local dev dependency is named fast-glob to satisfy the upstream import.
A version-scoped npm override references that direct dependency through $fast-glob.
This avoids resolving a local path relative to an installed transitive package.

The adapter requires Node >=22.13, aligned with the root project. The lint command
first runs frontend/scripts/lint-toolchain-check.mjs, then the existing eslint
command. The tests verify:

- Exact Next plugin version, source digest and sole fast-glob import site.
- Actual module resolution to the local package, not a registry or dangling link.
- Absence of braces, micromatch and stale prototype metadata from the full lock.
- Directory/path behavior and fail-closed configuration failures.
- Actual no-html-link-for-pages diagnostics for default, explicit and array roots.
- Distinct routes in each array root and App Router-only homepage discovery.

Any Next plugin update requires a fresh source review, updated guards and passing
tests. Do not broaden the adapter into a general glob engine or replace failing
tests with rule exclusions.

## Verification

Run npm --prefix frontend ci, npm --prefix frontend run lint and
npm --prefix frontend audit --audit-level=high. The full audit includes development
tools; no advisory exclusion or lowered threshold is permitted. Require the default
Linux production build and security workflow on the exact PR commit as well.

An alternate general glob matcher was evaluated and rejected after independent
review reproduced path, hidden-directory, brace-range and case mismatches.
The final adapter does not use that matcher. Independent human security review
and the other launch gates remain separate from this dependency repair.

## Upstream Rule Limitation

The pinned Next 16.3.8 no-html-link-for-pages rule misses nested App Router links.
Its generated app URL regex omits the trailing slash used by its href normalizer.
The regression suite reproduces the miss using unmodified default-root behavior
and checks that the adapter has identical behavior, while separately requiring a
real diagnostic for an App Router-only homepage. This is a pre-existing navigation
lint limitation, not a fixed finding or an audit exclusion. A separately reviewed
upstream plugin update should address it; do not claim complete nested-App-Router
link coverage from this repair.
