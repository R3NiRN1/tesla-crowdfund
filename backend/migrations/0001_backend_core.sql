CREATE TABLE backend_schema_migrations (
  name text PRIMARY KEY,
  checksum char(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE backend_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE backend_challenges (
  id uuid PRIMARY KEY,
  address text NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
  nonce uuid NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE TABLE backend_wallet_sessions (
  token_hash char(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  address text NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  revoked_at timestamptz
);
CREATE INDEX backend_wallet_sessions_active_idx ON backend_wallet_sessions (address, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE backend_publications (
  submission_id uuid PRIMARY KEY,
  chain_id bigint NOT NULL CHECK (chain_id > 0),
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  campaign_address text NOT NULL CHECK (campaign_address ~ '^0x[0-9a-f]{40}$'),
  UNIQUE (chain_id, transaction_hash),
  UNIQUE (chain_id, campaign_address)
);

CREATE TABLE backend_operators (
  id uuid PRIMARY KEY,
  subject text NOT NULL UNIQUE CHECK (length(subject) BETWEEN 1 AND 200),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL
);

CREATE TABLE backend_operator_roles (
  operator_id uuid NOT NULL REFERENCES backend_operators(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('submission.read', 'submission.review', 'audit.read', 'diagnostics.read')),
  PRIMARY KEY (operator_id, role)
);

CREATE TABLE backend_operator_credentials (
  id uuid PRIMARY KEY,
  operator_id uuid NOT NULL REFERENCES backend_operators(id) ON DELETE CASCADE,
  secret_hash char(64) NOT NULL UNIQUE CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE TABLE backend_operator_sessions (
  token_hash char(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  operator_id uuid NOT NULL REFERENCES backend_operators(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  revoked_at timestamptz
);

CREATE TABLE backend_audit_events (
  id uuid PRIMARY KEY,
  action text NOT NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('wallet', 'operator', 'system')),
  actor_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX backend_audit_events_occurred_idx ON backend_audit_events (occurred_at DESC);
