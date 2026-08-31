# Production operator authorization

Creator wallet authentication and operator authorization are separate security boundaries. A creator session can manage only submissions owned by that wallet; it cannot read the moderation queue, diagnostics or audit log and cannot approve a campaign.

Operators are named server-side identities with explicit technical roles:

- `submission.read`
- `submission.review`
- `audit.read`
- `diagnostics.read`

Provision a development/test operator from a trusted shell connected to the configured repository:

```text
npm run backend:operator -- create <subject> [display-name] [comma-separated-roles]
```

The command prints a high-entropy credential once. Store it immediately in the hosting secret manager; only its hash is persisted. The browser exchanges that credential for a short-lived hashed operator session. Moderation routes derive reviewer identity and roles from that session, reject request-supplied `reviewerAddress`, and include the operator identity in the same transaction as the decision audit event.

Credential revocation is a trusted CLI operation:

```text
npm run backend:operator -- revoke-credential <credential-id>
```

This credential adapter is a credible pre-production boundary, not the final hosting identity decision. Production still needs a human choice for secret distribution/rotation and whether an OIDC, mTLS or workforce identity provider replaces credentials. The role/authorizer boundary is deliberately independent of crowdfunding governance and arbitrator policy, so that hosting choice does not rewrite business logic.
