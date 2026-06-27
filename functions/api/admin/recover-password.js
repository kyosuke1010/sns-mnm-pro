import { constantTimeEqualString, hashPassword } from "../../_lib/security.js";

export async function onRequestPost({ request, env }) {
  try {
    if (env.ALLOW_ADMIN_BOOTSTRAP !== "true") {
      return fail("RECOVERY_DISABLED", "Admin recovery is disabled", 404);
    }
    if (!env.DB) return fail("DB_BINDING_MISSING", "D1 binding is not configured", 500);
    if (!env.APP_SECRET) return fail("APP_SECRET_MISSING", "APP_SECRET is not configured", 500);

    const headerSecret = request.headers.get("X-App-Secret") || "";
    const secretOk = await constantTimeEqualString(headerSecret, env.APP_SECRET);
    if (!secretOk) return fail("INVALID_APP_SECRET", "Unauthorized", 401);

    const input = await readJson(request);
    if (input.__invalidJson) return fail("INVALID_JSON", "Request body must be valid JSON", 400);

    const email = normalizeEmail(input.email);
    const password = String(input.password || "");
    if (!isEmail(email)) return fail("INVALID_EMAIL", "email is invalid", 400);
    if (password.length < 12) return fail("PASSWORD_TOO_SHORT", "password must be at least 12 characters", 400);

    const admin = await env.DB.prepare("SELECT id, email, role FROM users WHERE email = ? LIMIT 1").bind(email).first();
    if (!admin || admin.role !== "admin") return fail("ADMIN_NOT_FOUND", "Admin user was not found", 404);

    const now = new Date().toISOString();
    let passwordHash = "";
    try {
      passwordHash = await hashPassword(password, env.APP_SECRET);
    } catch (error) {
      logRecoveryError("PASSWORD_HASH_FAILED", error);
      return fail("PASSWORD_HASH_FAILED", "Could not hash password", 500);
    }

    await env.DB.prepare(`
      UPDATE users
      SET password_hash = ?,
          role = 'admin',
          plan = 'admin_full',
          status = 'active',
          trial_started_at = NULL,
          trial_expires_at = NULL,
          trial_status = NULL,
          updated_at = ?
      WHERE id = ?
    `).bind(passwordHash, now, admin.id).run();

    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(admin.id).run();

    try {
      await env.DB.prepare(`
        INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, detail_json, created_at)
        VALUES (?, ?, 'admin_password_recovery', 'user', ?, ?, ?)
      `).bind(crypto.randomUUID(), admin.id, admin.id, JSON.stringify({ email }), now).run();
    } catch (error) {
      logRecoveryError("AUDIT_LOG_FAILED", error);
    }

    return Response.json({ ok: true, user: { email, role: "admin", plan: "admin_full" } });
  } catch (error) {
    logRecoveryError("RECOVERY_UNHANDLED", error);
    return fail("RECOVERY_UNHANDLED", "Admin recovery failed", 500);
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

function logRecoveryError(errorCode, error) {
  const message = error instanceof Error ? error.message : String(error || "");
  console.error(JSON.stringify({
    area: "admin_recovery",
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
