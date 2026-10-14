-- Staging-only schema proposal. Do not apply to production until ceremony routes and tests are reviewed.
CREATE TABLE IF NOT EXISTS owner_passkey_credentials (
  credential_id TEXT PRIMARY KEY NOT NULL,
  public_key_spki TEXT NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
  transports_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_owner_passkey_credentials_last_used
  ON owner_passkey_credentials(last_used_at);
