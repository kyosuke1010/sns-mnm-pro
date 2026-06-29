// 購入後の初回パスワード設定。ワンタイムトークン（メール記載）で本人確認し、
// パスワードを設定してそのままログイン状態にする。

import { createSession, SESSION_SCOPE_USER } from "../../_lib/auth.js";
import { hashPassword } from "../../_lib/security.js";
import { hashPasswordSetToken } from "../../_lib/billing.js";

function fail(message, status) {
  return Response.json({ ok: false, error: message }, { status });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || !env.APP_SECRET) return fail("サーバー設定が未完了です。", 500);
    let input = {};
    try { input = await request.json(); } catch { input = {}; }

    const token = String(input.token || "").trim();
    const password = String(input.password || "");
    const confirm = String(input.password_confirm || input.passwordConfirm || "");

    if (!token) return fail("リンクが正しくありません。メールのリンクから開いてください。", 400);
    if (password.length < 8) return fail("パスワードは8文字以上で入力してください。", 400);
    if (password !== confirm) return fail("パスワードが一致しません。", 400);

    const tokenHash = await hashPasswordSetToken(env, token);
    const now = new Date().toISOString();
    const user = await env.DB.prepare(`
      SELECT * FROM users
      WHERE password_set_token_hash = ?
        AND password_set_expires_at IS NOT NULL
        AND password_set_expires_at > ?
      LIMIT 1
    `).bind(tokenHash, now).first();

    if (!user) {
      return fail("このリンクは無効か、有効期限が切れています。お手数ですが運営までご連絡ください。", 400);
    }
    if (user.role === "admin") {
      return fail("この操作はできません。", 403);
    }

    const passwordHash = await hashPassword(password, env.APP_SECRET);
    await env.DB.prepare(`
      UPDATE users
      SET password_hash = ?,
          status = 'active',
          password_set_token_hash = NULL,
          password_set_expires_at = NULL,
          updated_at = ?
      WHERE id = ?
    `).bind(passwordHash, now, user.id).run();

    const session = await createSession(env, request, {
      id: user.id,
      email: user.email,
      role: "user",
      plan: user.plan || "lite",
      trialStartedAt: user.trial_started_at,
      trialExpiresAt: user.trial_expires_at,
      trialStatus: user.trial_status
    }, SESSION_SCOPE_USER);

    return Response.json(
      { ok: true, redirect: "/index.html?page=settings" },
      { headers: { "Set-Cookie": session.cookie } }
    );
  } catch {
    return fail("パスワード設定に失敗しました。時間をおいて再度お試しください。", 500);
  }
}
