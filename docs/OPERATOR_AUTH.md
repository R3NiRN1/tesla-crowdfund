# Production operator authorization

Creator wallet authentication and operator authorization are separate security boundaries. A creator session can manage only submissions owned by that wallet; it cannot read the moderation queue, diagnostics or audit log and cannot approve a campaign.

Operators are named server-side identities with explicit technical roles:

- `submission.read`
- `submission.review`
- `audit.read`
- `diagnostics.read`

Roles are independent. Diagnostics summary counts and safe configuration need
`diagnostics.read`; recent audit event contents additionally need `audit.read`.
Without that second permission the response has `auditAccess: false` and an empty
`recentAudit` array. An audit-only operator cannot read diagnostics.

`POST /operator/logout` requires an active operator session, not a submission or
diagnostics role. It revokes only the bearer session and records the operator's
identity in the revocation audit event. Other sessions and credentials remain
active. A creator-wallet session cannot authorize operator logout. Expired,
revoked, inactive or invalid operator sessions fail closed.

Provision a development/test operator from a trusted shell connected to the configured repository:

```text
npm run backend:operator -- create <subject> [display-name] [comma-separated-roles]
```

The command prints a high-entropy credential once. Store it immediately in the hosting secret manager; only its hash is persisted. The browser exchanges that credential for a short-lived hashed operator session. Moderation routes derive reviewer identity and roles from that session, reject request-supplied `reviewerAddress`, and include the operator identity in the same transaction as the decision audit event.

Credential revocation is a trusted CLI operation:

```text
npm run backend:operator -- revoke-credential <credential-id>
```

Revocation invalidates every session issued by that credential in the same
repository transaction. Authorization also rechecks credential binding, operator
identity, revocation and expiry on each request; another valid credential is not
revoked as a side effect. Requests already authorized before revocation are not
retroactively undone.

After applying the security repair, legacy sessions without `credentialId` fail
closed. Operators must authenticate again with a valid credential. No destructive
database reset or credential export is required. Invalid expiry data is rejected,
not treated as unlimited access.

This credential adapter is a credible pre-production boundary, not the final hosting identity decision. Production still needs a human choice for secret distribution/rotation and whether an OIDC, mTLS or workforce identity provider replaces credentials. The role/authorizer boundary is deliberately independent of crowdfunding governance and arbitrator policy, so that hosting choice does not rewrite business logic.
