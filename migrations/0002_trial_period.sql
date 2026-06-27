-- SNS MNM-PRO trial period migration
-- Replaces per-feature free trial limits with a 3-day trial window.

ALTER TABLE users ADD COLUMN trial_started_at TEXT;
ALTER TABLE users ADD COLUMN trial_expires_at TEXT;
ALTER TABLE users ADD COLUMN trial_status TEXT CHECK (trial_status IN ('active', 'expired', 'converted', 'canceled'));

CREATE INDEX IF NOT EXISTS idx_users_trial_status ON users(trial_status);
CREATE INDEX IF NOT EXISTS idx_users_trial_expires_at ON users(trial_expires_at);
