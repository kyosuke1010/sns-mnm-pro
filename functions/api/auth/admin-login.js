import { createSession, SESSION_SCOPE_ADMIN } from "../../_lib/auth.js";
import { verifyPassword } from "../../_lib/security.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || !env.APP_SECRET) throw new Error("Auth bindings are not configured");
    const input = await readJson(request);
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");

    if (!isEmail(email) || !password) {
      return fail("メールアドレスとパスワードを入力してください", 400);
    }

    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ? LIMIT 1").bind(email).first();
    if (!user) return fail("メールアドレスまたはパスワードが正しくありません", 401);
    if (user.status !== "active") return fail("このアカウントは利用できません", 403);
    if (user.role !== "admin") return fail("管理者権限がありません", 403);

    const passwordOk = await verifyPassword(password, user.password_hash, env.APP_SECRET);
    if (!passwordOk) return fail("メールアドレスまたはパスワードが正しくありません", 401);

    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, user.id).run();

    const session = await createSession(env, request, {
      id: user.id,
      email: user.email,
      role: "admin",
      plan: "admin_full"
    }, SESSION_SCOPE_ADMIN);

    return Response.json({ ok: true, redirect: "/admin", user: publicUser(session.user) }, {
      headers: { "Set-Cookie": session.cookie }
    });
  } catch {
    return fail("管理者ログインに失敗しました。時間をおいて再度お試しください。", 500);
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function publicUser(user) {
  return { email: user.email, role: user.role, plan: user.plan };
}

function fail(message, status) {
  return Response.json({ ok: false, error: message }, { status });
}
