-- SNS MNM-PRO PayPal billing / auto-provisioning migration
-- Additive only. Existing users are unaffected (new columns are nullable).
--
-- Notes:
-- - plan_type is the existing users.plan column (trial/lite/pro/admin_full).
-- - trial_end_date is the existing users.trial_expires_at column.
-- - This migration adds subscription/billing bookkeeping and a one-time
--   password-set token used by the fully-automated post-payment flow.

ALTER TABLE users ADD COLUMN plan_start_date TEXT;
ALTER TABLE users ADD COLUMN plan_cancel_date TEXT;
ALTER TABLE users ADD COLUMN paypal_subscription_id TEXT;
ALTER TABLE users ADD COLUMN password_set_token_hash TEXT;
ALTER TABLE users ADD COLUMN password_set_expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_paypal_subscription_id ON users(paypal_subscription_id);

CREATE TABLE IF NOT EXISTS purchase_history (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT,
  plan_type TEXT,
  payment_method TEXT NOT NULL DEFAULT 'paypal' CHECK (payment_method IN ('paypal', 'stripe', 'manual')),
  amount_jpy INTEGER,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'refunded', 'canceled')),
  transaction_id TEXT,
  subscription_id TEXT,
  raw_event_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Idempotency: never record the same PayPal transaction twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_history_transaction
  ON purchase_history(transaction_id)
  WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_history_user_id ON purchase_history(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_history_subscription ON purchase_history(subscription_id);
