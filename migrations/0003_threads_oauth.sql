-- SNS MNM-PRO Threads OAuth support
-- Admin stores the Meta app once; buyers connect through OAuth.

CREATE TABLE IF NOT EXISTS service_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  encrypted_value TEXT,
  value_last4 TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_admin_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE threads_connections ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'manual' CHECK (auth_type IN ('manual', 'oauth'));
ALTER TABLE threads_connections ADD COLUMN oauth_connected_at TEXT;
ALTER TABLE threads_connections ADD COLUMN token_issued_at TEXT;
ALTER TABLE threads_connections ADD COLUMN token_refresh_after_at TEXT;
ALTER TABLE threads_connections ADD COLUMN token_refresh_due_at TEXT;
ALTER TABLE threads_connections ADD COLUMN token_last_refreshed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_threads_connections_auth_type ON threads_connections(auth_type);
CREATE INDEX IF NOT EXISTS idx_threads_connections_token_expires_at ON threads_connections(token_expires_at);
CREATE INDEX IF NOT EXISTS idx_service_settings_updated_at ON service_settings(updated_at);
