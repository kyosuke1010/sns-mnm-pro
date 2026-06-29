// 管理者専用: 決済用のD1スキーマ（migration 0005 相当）を冪等に適用する。
// wrangler を使えない運用向け。既に適用済みの列/表は安全にスキップする。
// このパス(/api/admin/*)は _middleware.js で管理者セッション必須。

import { requireAdminUser } from "../../_lib/auth.js";

const ADD_COLUMNS = [
  "ALTER TABLE users ADD COLUMN plan_start_date TEXT",
  "ALTER TABLE users ADD COLUMN plan_cancel_date TEXT",
  "ALTER TABLE users ADD COLUMN paypal_subscription_id TEXT",
  "ALTER TABLE users ADD COLUMN password_set_token_hash TEXT",
  "ALTER TABLE users ADD COLUMN password_set_expires_at TEXT"
];

const SAFE_STATEMENTS = [
  "CREATE INDEX IF NOT EXISTS idx_users_paypal_subscription_id ON users(paypal_subscription_id)",
  `CREATE TABLE IF NOT EXISTS purchase_history (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    email TEXT,
    plan_type TEXT,
    payment_method TEXT NOT NULL DEFAULT 'paypal' CHECK (payment_method IN ('paypal','stripe','manual')),
    amount_jpy INTEGER,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed','refunded','canceled')),
    transaction_id TEXT,
    subscription_id TEXT,
    raw_event_type TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_history_transaction ON purchase_history(transaction_id) WHERE transaction_id IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS idx_purchase_history_user_id ON purchase_history(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_purchase_history_subscription ON purchase_history(subscription_id)"
];

export async function onRequestPost({ request, env }) {
  await requireAdminUser(env, request);
  if (!env.DB) {
    return Response.json({ ok: false, error: "D1 binding がありません。" }, { status: 500 });
  }

  const applied = [];
  const skipped = [];
  const failed = [];

  for (const sql of ADD_COLUMNS) {
    try {
      await env.DB.prepare(sql).run();
      applied.push(sql);
    } catch (error) {
      const msg = String(error?.message || error);
      if (/duplicate column name/i.test(msg)) {
        skipped.push(sql + "（既に適用済み）");
      } else {
        failed.push({ sql, error: msg });
      }
    }
  }

  for (const sql of SAFE_STATEMENTS) {
    try {
      await env.DB.prepare(sql).run();
      applied.push(sql.split("\n")[0].trim() + " …");
    } catch (error) {
      failed.push({ sql: sql.split("\n")[0].trim() + " …", error: String(error?.message || error) });
    }
  }

  return Response.json({
    ok: failed.length === 0,
    applied_count: applied.length,
    skipped_count: skipped.length,
    failed,
    message: failed.length === 0
      ? "決済用スキーマの適用が完了しました。"
      : "一部の適用に失敗しました。エラー内容を確認してください。"
  });
}
