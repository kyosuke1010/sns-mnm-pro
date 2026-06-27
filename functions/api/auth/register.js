import { createSession, SESSION_SCOPE_USER } from "../../_lib/auth.js";
import { hashLicenseKey, hashPassword } from "../../_lib/security.js";

const TRIAL_DAYS = 3;

export async function onRequestPost({ request, env }) {
  try {
    requireBindings(env);
    const input = await readJson(request);
    const email = normalizeEmail(input.email);
    const licenseKey = String(input.license_key || input.licenseKey || "").trim();
    const password = String(input.password || "");
    const confirm = String(input.password_confirm || input.passwordConfirm || "");

    if (!isEmail(email)) return fail("メールアドレスを確認してください。", 400);
    if (!licenseKey) return fail("ライセンスキーを入力してください。", 400);
    if (password.length < 8) return fail("パスワードは8文字以上で入力してください。", 400);
    if (password !== confirm) return fail("パスワードが一致しません", 400);

    const licenseHash = await hashLicenseKey(licenseKey, env.APP_SECRET);
    const license = await env.DB.prepare("SELECT * FROM licenses WHERE license_hash = ? LIMIT 1").bind(licenseHash).first();

    if (!license) return fail("ライセンスキーが正しくありません", 400);
    if (normalizeEmail(license.email) !== email) return fail("メールアドレスが購入時情報と一致しません", 400);
    if (isLicenseBlocked(license.status)) return fail("このライセンスキーは停止中です", 403);
    if (isLicenseExpired(license.expires_at)) return fail("このライセンスキーは期限切れです", 403);

    const now = new Date().toISOString();
    const passwordHash = await hashPassword(password, env.APP_SECRET);
    const existingUser = await env.DB.prepare("SELECT * FROM users WHERE email = ? LIMIT 1").bind(email).first();

    let userId = existingUser?.id || license.user_id || crypto.randomUUID();
    const role = license.plan === "admin_full" ? "admin" : "user";
    const trialState = buildTrialState(license.plan, existingUser, now, license.expires_at);

    if (existingUser) {
      if (existingUser.role === "admin") {
        return fail("このメールアドレスは管理者アカウントで使用中です。購入者の初回登録には別のメールアドレスを使用してください", 409);
      }
      if (license.user_id && license.user_id !== existingUser.id) {
        return fail("このライセンスキーはすでに使用されています", 409);
      }

      await env.DB.prepare(`
        UPDATE users
        SET password_hash = ?,
            role = ?,
            plan = ?,
            status = 'active',
            trial_started_at = ?,
            trial_expires_at = ?,
            trial_status = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(
        passwordHash,
        role,
        license.plan || "trial",
        trialState.startedAt,
        trialState.expiresAt,
        trialState.status,
        now,
        existingUser.id
      ).run();

      userId = existingUser.id;
    } else {
      await env.DB.prepare(`
        INSERT INTO users (
          id, email, display_name, password_hash, role, plan, status,
          trial_started_at, trial_expires_at, trial_status,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
      `).bind(
        userId,
        email,
        license.buyer_name || null,
        passwordHash,
        role,
        license.plan || "trial",
        trialState.startedAt,
        trialState.expiresAt,
        trialState.status,
        now,
        now
      ).run();
    }

    await env.DB.prepare(`
      UPDATE licenses
      SET status = 'active',
          user_id = ?,
          activated_at = COALESCE(activated_at, ?)
      WHERE id = ?
    `).bind(userId, now, license.id).run();

    const session = await createSession(env, request, {
      id: userId,
      email,
      role,
      plan: license.plan || "trial",
      trialStartedAt: trialState.startedAt,
      trialExpiresAt: trialState.expiresAt,
      trialStatus: trialState.status
    }, SESSION_SCOPE_USER);

    return Response.json(
      {
        ok: true,
        redirect: "/index.html?page=settings",
        user: publicUser(session.user)
      },
      {
        headers: { "Set-Cookie": session.cookie }
      }
    );
  } catch {
    return fail("初回登録に失敗しました。入力内容を確認してください。", 500);
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function requireBindings(env) {
  if (!env.DB || !env.APP_SECRET) throw new Error("Auth bindings are not configured");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isLicenseBlocked(status) {
  return ["suspended", "revoked", "expired"].includes(String(status || ""));
}

function isLicenseExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

function buildTrialState(plan, user, now, licenseExpiresAt) {
  if (plan !== "trial") {
    return {
      startedAt: null,
      expiresAt: null,
      status: plan === "admin_full" ? null : "converted"
    };
  }

  const startedAt = user?.trial_started_at || now;
  const expiresAt = user?.trial_expires_at || licenseExpiresAt || new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const expired = new Date(expiresAt).getTime() <= Date.now();

  return {
    startedAt,
    expiresAt,
    status: expired ? "expired" : "active"
  };
}

function publicUser(user) {
  return { email: user.email, role: user.role, plan: user.plan };
}

function fail(message, status) {
  return Response.json({ ok: false, error: message }, { status });
}
