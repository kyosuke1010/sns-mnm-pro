// 管理者専用: 決済テストの確認＆サポート用。
// GET  … 直近の購入履歴と、PayPalで作成された購入者を返す。
// POST … 指定メールの購入者にパスワード設定リンクを再発行して返す
//         （Resend 未設定でもテスト/サポートでログインまで通せるように）。
// このパス(/api/admin/*)は _middleware.js で管理者セッション必須。

import { requireAdminUser } from "../../_lib/auth.js";
import { createPasswordSetToken, passwordSetUrl } from "../../_lib/billing.js";

export async function onRequestGet({ request, env }) {
  await requireAdminUser(env, request);
  if (!env.DB) return Response.json({ ok: false, error: "D1 binding がありません。" }, { status: 500 });

  let purchases = [];
  let users = [];
  try {
    const p = await env.DB.prepare(
      `SELECT email, plan_type, payment_method, amount_jpy, status, subscription_id, raw_event_type, created_at
       FROM purchase_history ORDER BY created_at DESC LIMIT 8`
    ).all();
    purchases = p.results || [];
  } catch (error) {
    return Response.json({ ok: false, error: "purchase_history を読めません。先に『決済DBを準備』を実行してください。", detail: String(error?.message || error) }, { status: 500 });
  }
  try {
    const u = await env.DB.prepare(
      `SELECT email, plan, status, paypal_subscription_id, trial_expires_at, created_at,
              CASE WHEN password_set_token_hash IS NOT NULL THEN 1 ELSE 0 END AS pending_password
       FROM users WHERE paypal_subscription_id IS NOT NULL ORDER BY created_at DESC LIMIT 8`
    ).all();
    users = u.results || [];
  } catch (error) {
    return Response.json({ ok: false, error: "users を読めません。", detail: String(error?.message || error) }, { status: 500 });
  }

  return Response.json({ ok: true, purchases, users });
}

export async function onRequestPost({ request, env }) {
  await requireAdminUser(env, request);
  if (!env.DB) return Response.json({ ok: false, error: "D1 binding がありません。" }, { status: 500 });

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return Response.json({ ok: false, error: "メールアドレスを入力してください。" }, { status: 400 });

  const user = await env.DB.prepare("SELECT id, role FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (!user) return Response.json({ ok: false, error: "そのメールの購入者が見つかりません。" }, { status: 404 });
  if (user.role === "admin") return Response.json({ ok: false, error: "管理者には発行できません。" }, { status: 403 });

  const { token, tokenHash, expiresAt } = await createPasswordSetToken(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE users SET password_set_token_hash = ?, password_set_expires_at = ?, updated_at = ? WHERE id = ?"
  ).bind(tokenHash, expiresAt, now, user.id).run();

  const base = env.APP_BASE_URL || new URL(request.url).origin;
  const url = passwordSetUrl({ APP_BASE_URL: base }, token);
  return Response.json({ ok: true, email, set_password_url: url, expires_at: expiresAt });
}
