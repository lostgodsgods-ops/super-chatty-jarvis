-- STAGING ONLY. Never apply this file to the production DB.
CREATE TABLE IF NOT EXISTS owner_passkey_credentials (
  credential_id TEXT PRIMARY KEY NOT NULL,
  owner_id INTEGER NOT NULL UNIQUE CHECK (owner_id = 1),
  public_key_b64 TEXT NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
  transports_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_owner_passkey_credentials_last_used
  ON owner_passkey_credentials(last_used_at);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  challenge TEXT NOT NULL,
  ceremony TEXT NOT NULL CHECK (ceremony IN ('register', 'login')),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expiry
  ON webauthn_challenges(expires_at);
