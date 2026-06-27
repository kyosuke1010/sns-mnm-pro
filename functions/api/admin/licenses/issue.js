import { requireAdminUser } from "../../../_lib/auth.js";
import { hashLicenseKey, hashPassword, last4, randomToken } from "../../../_lib/security.js";

const TRIAL_DAYS = 3;

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || !env.APP_SECRET) throw new Error("Admin bindings are not configured");

    const admin = await requireAdminUser(env, request);
    const input = await readJson(request);
    const email = normalizeEmail(input.email);
    const plan = normalizePlan(input.plan);

    if (!isEmail(email)) return fail("メールアドレスを確認してください。", 400);
    if (!plan) return fail("プランを確認してください。", 400);

    const now = new Date().toISOString();
    const buyerName = normalizeOptionalText(input.buyer_name || input.buyerName || input.name);
    const paymentName = normalizeOptionalText(input.payment_name || input.paymentName);
    const stripePaymentId = normalizeOptionalText(input.stripe_payment_id || input.stripePaymentId);
    const memo = normalizeOptionalText(input.memo);
    const expiresAt = normalizeOptionalDate(input.expires_at || input.expiresAt);

    const existingUser = await env.DB.prepare("SELECT * FROM users WHERE email = ? LIMIT 1").bind(email).first();
    const userId = existingUser?.id || crypto.randomUUID();
    const role = plan === "admin_full" ? "admin" : "user";
    const trialState = buildTrialState(plan, now, expiresAt);

    if (existingUser) {
      await env.DB.prepare(`
        UPDATE users
        SET display_name = COALESCE(?, display_name),
            role = ?,
            plan = ?,
            status = 'active',
            trial_started_at = ?,
            trial_expires_at = ?,
            trial_status = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(
        buyerName,
        role,
        plan,
        trialState.startedAt,
        trialState.expiresAt,
        trialState.status,
        now,
        userId
      ).run();
    } else {
      const placeholderPasswordHash = await hashPassword(randomToken(24), env.APP_SECRET);
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
        buyerName,
        placeholderPasswordHash,
        role,
        plan,
        trialState.startedAt,
        trialState.expiresAt,
        trialState.status,
        now,
        now
      ).run();
    }

    const licenseKey = createLicenseKey();
    const licenseHash = await hashLicenseKey(licenseKey, env.APP_SECRET);
    const licenseId = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO licenses (
        id, license_hash, license_last4, email, plan, status, issued_at, expires_at,
        activated_at, user_id, buyer_name, payment_name, stripe_payment_id, memo, created_by_admin_id
      )
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      licenseId,
      licenseHash,
      last4(licenseKey),
      email,
      plan,
      now,
      expiresAt,
      now,
      userId,
      buyerName,
      paymentName,
      stripePaymentId,
      memo,
      admin.userId
    ).run();

    await env.DB.prepare(`
      INSERT INTO admin_audit_logs (id, admin_user_id, action, target_type, target_id, detail_json, created_at)
      VALUES (?, ?, 'license_issue', 'license', ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      admin.userId,
      licenseId,
      JSON.stringify({ email, userId, plan, expiresAt }),
      now
    ).run();

    return Response.json({
      ok: true,
      license: {
        id: licenseId,
        user_id: userId,
        license_key: licenseKey,
        license_last4: last4(licenseKey),
        email,
        plan,
        status: "active",
        expires_at: expiresAt,
        buyer_name: buyerName,
        payment_name: paymentName,
        stripe_payment_id: stripePaymentId,
        memo
      },
      note: "ライセンスキーの全文表示は発行直後のみです。以後は末尾4文字のみ確認できます。"
    });
  } catch {
    return fail("ライセンス発行に失敗しました。", 500);
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function createLicenseKey() {
  const raw = randomToken(18).replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 12).padEnd(12, "X");
  return `SNS-MNM-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

function normalizePlan(value) {
  const plan = String(value || "").trim();
  return ["trial", "lite", "pro", "admin_full"].includes(plan) ? plan : "";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeOptionalText(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeOptionalDate(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function buildTrialState(plan, now, expiresAt) {
  if (plan !== "trial") {
    return {
      startedAt: null,
      expiresAt: null,
      status: plan === "admin_full" ? null : "converted"
    };
  }

  return {
    startedAt: now,
    expiresAt: expiresAt || new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    status: "active"
  };
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function fail(message, status) {
  return Response.json({ ok: false, error: message }, { status });
}
