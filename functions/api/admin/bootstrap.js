import { createSession, SESSION_SCOPE_ADMIN } from "../../_lib/auth.js";
import { constantTimeEqualString, hashPassword } from "../../_lib/security.js";

export async function onRequestPost({ request, env }) {
  try {
    if (env.ALLOW_ADMIN_BOOTSTRAP !== "true") {
      return fail("BOOTSTRAP_DISABLED", "Admin bootstrap is disabled", 404);
    }
    if (!env.DB) return fail("DB_BINDING_MISSING", "D1 binding is not configured", 500);
    if (!env.APP_SECRET) return fail("APP_SECRET_MISSING", "APP_SECRET is not configured", 500);

    const headerSecret = request.headers.get("X-App-Secret") || "";
    const secretOk = await constantTimeEqualString(headerSecret, env.APP_SECRET);
    if (!secretOk) return fail("INVALID_APP_SECRET", "Unauthorized", 401);

    let existingAdmin = null;
    try {
      existingAdmin = await env.DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first();
    } catch (error) {
      logBootstrapError("EXISTING_ADMIN_CHECK_FAILED", error);
      return fail("EXISTING_ADMIN_CHECK_FAILED", "Could not check existing admin user", 500);
    }
    if (existingAdmin) return fail("ADMIN_ALREADY_EXISTS", "Admin user already exists", 409);

    const input = await readJson(request);
    if (input.__invalidJson) return fail("INVALID_JSON", "Request body must be valid JSON", 400);
    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    const displayName = String(input.display_name || input.displayName || "KOUCHA-LAB Admin").trim();
    if (!email) return fail("MISSING_EMAIL", "email is required", 400);
    if (!isEmail(email)) return fail("INVALID_EMAIL", "email is invalid", 400);
    if (!password) return fail("MISSING_PASSWORD", "password is required", 400);
    if (password.length < 12) return fail("PASSWORD_TOO_SHORT", "password must be at least 12 characters", 400);

    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    let passwordHash = "";
    try {
      passwordHash = await hashPassword(password, env.APP_SECRET);
    } catch (error) {
      logBootstrapError("PASSWORD_HASH_FAILED", error);
      return fail("PASSWORD_HASH_FAILED", "Could not hash password", 500);
    }

    try {
      await env.DB.prepare(`
        INSERT INTO users (id, email, display_name, password_hash, role, plan, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'admin', 'admin_full', 'active', ?, ?)
      `).bind(userId, email, displayName, passwordHash, now, now).run();
    } catch (error) {
      logBootstrapError("INSERT_ADMIN_FAILED", error);
      return fail("INSERT_ADMIN_FAILED", "Could not create admin user", 500);
    }

    let warningCode = null;
    try {
      await env.DB.prepare(`
        INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, detail_json, created_at)
        VALUES (?, ?, 'admin_bootstrap', 'user', ?, ?, ?)
      `).bind(crypto.randomUUID(), userId, userId, JSON.stringify({ email }), now).run();
    } catch (error) {
      warningCode = "INSERT_AUDIT_LOG_FAILED";
      logBootstrapError(warningCode, error);
    }

    try {
  const session = await createSession(env, request, { id: userId, email, role: "admin", plan: "admin_full" }, SESSION_SCOPE_ADMIN);
      return Response.json(
        { ok: true, redirect: "/admin", user: { email, role: "admin", plan: "admin_full" }, warning_code: warningCode },
        { headers: { "Set-Cookie": session.cookie } }
      );
    } catch (error) {
      logBootstrapError("SESSION_CREATE_FAILED", error);
      return Response.json({
        ok: true,
        redirect: "/admin/login",
        user: { email, role: "admin", plan: "admin_full" },
        warning_code: warningCode || "SESSION_CREATE_FAILED"
      });
    }
  } catch (error) {
    logBootstrapError("BOOTSTRAP_UNHANDLED", error);
    return fail("BOOTSTRAP_UNHANDLED", "Admin bootstrap failed", 500);
  }
}

async function readJson(request) {
  const raw = await request.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __invalidJson: true };
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function fail(errorCode, message, status) {
  return Response.json({ ok: false, error_code: errorCode, message }, { status });
}

function logBootstrapError(errorCode, error) {
  const message = error instanceof Error ? error.message : String(error || "");
  console.error(JSON.stringify({
    area: "admin_bootstrap",
    error_code: errorCode,
    message: sanitizeLogMessage(message)
  }));
}

function sanitizeLogMessage(message) {
  return String(message || "")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-****")
    .replace(/SNS-MNM-[A-Z0-9-]+/g, "SNS-MNM-****")
    .slice(0, 240);
}
