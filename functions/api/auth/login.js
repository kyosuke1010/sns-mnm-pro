import { createSession, SESSION_SCOPE_USER } from "../../_lib/auth.js";
import { hashLicenseKey, verifyPassword } from "../../_lib/security.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || !env.APP_SECRET) throw new Error("Auth bindings are not configured");

    const input = await readJson(request);
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    const licenseKey = String(input.license_key || input.licenseKey || "").trim();

    if (!isEmail(email)) {
      return fail("メールアドレスを確認してください", 400);
    }

    if (licenseKey) {
      return await loginWithLicense({ env, request, email, licenseKey });
    }

    if (!password) {
      return fail("メールアドレスとパスワードを入力してください", 400);
    }

    return await loginWithPassword({ env, request, email, password });
  } catch {
    return fail("ログインに失敗しました。時間をおいて再度お試しください。", 500);
  }
}

async function loginWithPassword({ env, request, email, password }) {
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (!user) return fail("メールアドレスまたはパスワードが正しくありません", 401);
  if (user.status !== "active") return fail("このアカウントは利用できません", 403);
  if (user.role === "admin") {
    return fail("管理者アカウントは管理者ログイン画面からログインしてください", 403);
  }

  const passwordOk = await verifyPassword(password, user.password_hash, env.APP_SECRET);
  if (!passwordOk) return fail("メールアドレスまたはパスワードが正しくありません", 401);

  const license = await env.DB.prepare(`
    SELECT *
    FROM licenses
    WHERE user_id = ?
      AND status = 'active'
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY COALESCE(activated_at, issued_at) DESC
    LIMIT 1
  `).bind(user.id, new Date().toISOString()).first();

  if (!license) return fail("ライセンスが有効ではありません", 403);

  return finalizeLogin({ env, request, user, plan: user.plan });
}

async function loginWithLicense({ env, request, email, licenseKey }) {
  const licenseHash = await hashLicenseKey(licenseKey, env.APP_SECRET);
  const row = await env.DB.prepare(`
    SELECT
      users.*,
      licenses.id AS license_id,
      licenses.status AS license_status,
      licenses.expires_at AS license_expires_at,
      licenses.plan AS license_plan
    FROM licenses
    INNER JOIN users ON users.id = licenses.user_id
    WHERE licenses.license_hash = ?
      AND licenses.email = ?
      AND licenses.status = 'active'
      AND users.status = 'active'
      AND users.role != 'admin'
      AND (licenses.expires_at IS NULL OR licenses.expires_at > ?)
    LIMIT 1
  `).bind(licenseHash, email, new Date().toISOString()).first();

  if (!row) {
    return fail("メールアドレスまたはライセンスキーが正しくありません", 401);
  }

  return finalizeLogin({
    env,
    request,
    user: row,
    plan: row.license_plan || row.plan
  });
}

async function finalizeLogin({ env, request, user, plan }) {
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, user.id).run();

  const session = await createSession(env, request, {
    id: user.id,
    email: user.email,
    role: user.role,
    plan,
    trialStartedAt: user.trial_started_at,
    trialExpiresAt: user.trial_expires_at,
    trialStatus: user.trial_status
  }, SESSION_SCOPE_USER);

  return Response.json(
    {
      ok: true,
      redirect: "/index.html?page=dashboard",
      user: publicUser(session.user)
    },
    {
      headers: { "Set-Cookie": session.cookie }
    }
  );
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
