-- SNS MNM-PRO D1 initial schema
-- Apply only after creating the production D1 database and bindings.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  password_algo TEXT NOT NULL DEFAULT 'pbkdf2-sha256',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'lite', 'pro', 'admin_full')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  license_hash TEXT NOT NULL UNIQUE,
  license_last4 TEXT NOT NULL,
  email TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('trial', 'lite', 'pro', 'admin_full')),
  status TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'active', 'suspended', 'expired', 'revoked')),
  issued_at TEXT NOT NULL,
  activated_at TEXT,
  expires_at TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  buyer_name TEXT,
  payment_name TEXT,
  stripe_payment_id TEXT,
  memo TEXT,
  created_by_admin_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_plan ON licenses(plan);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  user_agent_hash TEXT,
  ip_hash TEXT,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_revoked_at ON sessions(revoked_at);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  payment_name TEXT NOT NULL,
  email TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('trial', 'lite', 'pro')),
  purpose TEXT NOT NULL,
  threads_url TEXT,
  x_url TEXT,
  referral_source TEXT,
  note TEXT,
  consent_openai_api INTEGER NOT NULL DEFAULT 0,
  consent_openai_cost INTEGER NOT NULL DEFAULT 0,
  consent_threads_auto_post_staged INTEGER NOT NULL DEFAULT 0,
  consent_manual_license INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'confirmed', 'mismatch', 'canceled')),
  license_status TEXT NOT NULL DEFAULT 'not_issued' CHECK (license_status IN ('not_issued', 'issued')),
  stripe_payment_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applications_email ON applications(email);
CREATE INDEX IF NOT EXISTS idx_applications_plan ON applications(plan);
CREATE INDEX IF NOT EXISTS idx_applications_payment_status ON applications(payment_status);
CREATE INDEX IF NOT EXISTS idx_applications_license_status ON applications(license_status);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  application_id TEXT REFERENCES applications(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  buyer_name TEXT,
  payment_name TEXT,
  email TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('trial', 'lite', 'pro')),
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'JPY',
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_payment_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'confirmed', 'mismatch', 'refunded', 'canceled')),
  license_status TEXT NOT NULL DEFAULT 'not_issued' CHECK (license_status IN ('not_issued', 'issued')),
  license_id TEXT REFERENCES licenses(id) ON DELETE SET NULL,
  paid_at TEXT,
  confirmed_at TEXT,
  confirmed_by_admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  memo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_email ON payments(email);
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON payments(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_license_status ON payments(license_status);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('trial', 'lite', 'pro', 'admin_full')),
  payment_provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'manual' CHECK (status IN ('manual', 'active', 'trialing', 'past_due', 'canceled', 'paused')),
  current_period_start TEXT,
  current_period_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);

CREATE TABLE IF NOT EXISTS usage_counters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  limit_count INTEGER,
  reset_period TEXT NOT NULL DEFAULT 'none',
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_user_id ON usage_counters(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_counters_feature_key ON usage_counters(feature_key);

CREATE TABLE IF NOT EXISTS ai_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  openai_key_encrypted TEXT,
  openai_key_last4 TEXT,
  model_mode TEXT NOT NULL DEFAULT 'standard' CHECK (model_mode IN ('low_cost', 'standard', 'high_quality')),
  profile_json_encrypted TEXT,
  encryption_key_version TEXT NOT NULL DEFAULT 'v1',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_settings_user_id ON ai_settings(user_id);

CREATE TABLE IF NOT EXISTS threads_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  meta_app_id TEXT,
  meta_app_secret_encrypted TEXT,
  meta_app_secret_last4 TEXT,
  threads_user_id TEXT,
  access_token_encrypted TEXT,
  access_token_last4 TEXT,
  token_expires_at TEXT,
  connection_status TEXT NOT NULL DEFAULT 'disconnected' CHECK (connection_status IN ('disconnected', 'connected', 'error', 'expired')),
  last_tested_at TEXT,
  last_synced_at TEXT,
  previous_follower_count INTEGER,
  current_follower_count INTEGER,
  current_value_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  encryption_key_version TEXT NOT NULL DEFAULT 'v1',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_threads_connections_user_id ON threads_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_threads_connections_status ON threads_connections(connection_status);
CREATE INDEX IF NOT EXISTS idx_threads_connections_threads_user_id ON threads_connections(threads_user_id);

CREATE TABLE IF NOT EXISTS generated_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  topic TEXT,
  target TEXT,
  purpose TEXT,
  platform TEXT NOT NULL DEFAULT 'Threads' CHECK (platform IN ('Threads', 'X', 'Threads / X')),
  content TEXT NOT NULL,
  cta TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled_memo', 'posted', 'failed')),
  scheduled_post_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_generated_posts_user_id ON generated_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_posts_type ON generated_posts(type);
CREATE INDEX IF NOT EXISTS idx_generated_posts_status ON generated_posts(status);
CREATE INDEX IF NOT EXISTS idx_generated_posts_created_at ON generated_posts(created_at);

CREATE TABLE IF NOT EXISTS generation_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  input_json TEXT,
  output_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_history_user_id ON generation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_history_feature_key ON generation_history(feature_key);
CREATE INDEX IF NOT EXISTS idx_generation_history_created_at ON generation_history(created_at);

CREATE TABLE IF NOT EXISTS winning_patterns (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  post_type TEXT,
  opening_pattern TEXT,
  body_structure TEXT,
  closing_cta TEXT,
  reason_why_it_worked TEXT,
  genre TEXT,
  memo TEXT,
  score INTEGER,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_winning_patterns_user_id ON winning_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_winning_patterns_post_type ON winning_patterns(post_type);
CREATE INDEX IF NOT EXISTS idx_winning_patterns_genre ON winning_patterns(genre);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generated_post_id TEXT REFERENCES generated_posts(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('Threads', 'X')),
  content TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'posted', 'failed', 'canceled')),
  threads_post_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user_id ON scheduled_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_at ON scheduled_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_platform ON scheduled_posts(platform);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_user_id ON admin_audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at);
