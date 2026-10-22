# Operator role boundary repair

Scope: issue #81. Proposed repair only; shared testing remains HOLD. This is a
separate dependency of wallet issue #77, not an expansion of issue #79's three
earlier repairs or an independent security certification.

## Reproduced defects

- A diagnostics-only operator could read unpublished audit contents through
  `/admin/diagnostics` despite being denied `/audit`.
- Logout required `submission.read`, preventing otherwise valid single-role
  reviewers, auditors and diagnostics operators from revoking their own session.

The actual loopback HTTP suite produced five failures against the unchanged
server: disclosure, three denied single-role logouts, and the missing explicit
audit-permission response flag. No public service was probed.

## Repair contract

Diagnostics still requires `diagnostics.read`. It returns aggregate counts and
safe configuration, but `recentAudit` stays empty unless the same operator also
has `audit.read`. The additive `auditAccess` flag lets the admin view distinguish
restricted audit details from an empty log. `/audit` retains its own role check.

Logout authenticates an active, credential-bound operator session without
requiring a business role. It derives identity solely from the bearer session,
revokes only that session, and preserves the attributable revocation audit event.
Request body identifiers cannot select another session. Credential revocation,
operator inactivity and expiry checks are unchanged.

## Regression coverage

- Fifteen actual HTTP/file-store cases pass after repair, including independent
  roles, permitted audit visibility, four single-role logouts, unrelated session
  preservation, and denied missing/malformed/unknown/expired/revoked/inactive or
  creator-wallet tokens. Test stores never persist plaintext credentials or keys.
- Five additional shared operator checks exercise single-session revocation and
  unrelated-session/credential preservation; the same checks run through the
  existing two-instance PostgreSQL integration suite.
- The new HTTP suite is mandatory in `npm run backend:check`.

Final candidate CI, PostgreSQL/restart/restore rehearsal, lint, build and audit
results must accompany the PR. A local test pass cannot approve public testing.
The thirteen earlier security review threads, actual browser-wallet acceptance,
public-host validation, fresh chain-97 deployment and real-time soak remain gates.
