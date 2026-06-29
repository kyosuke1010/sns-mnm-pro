// SNS MNM-PRO — 決済後の完全自動プロビジョニング（土台）
//
// 役割:
//   - PayPal（将来 Stripe / 手動）の決済確定イベントを受けて、購入者ユーザーを
//     自動で作成 / 更新する（plan=lite, 7日間トライアル窓を付与）。
//   - 二重計上を防ぐ purchase_history の冪等記録。
//   - 初回パスワード設定用のワンタイムトークンを発行（ハッシュのみ保存）。
//   - 取引メール送信のインターフェース（Resend）。未設定なら no-op。
//
// 重要:
//   - PayPal / メールのシークレットは Cloudflare の環境変数（Secrets）から読むだけ。
//     コードにキーを書かない。env.* を参照する。
//   - security.js / auth.js のスキーマや認証は変更しない（import のみ）。
//
// 検証:
//   - DB アクセスは小さなヘルパ単位に分割してあるので、env.DB をモックすれば
//     外部認証情報なしでローカル node テストが可能（test/billing.test.mjs）。

import { hashPassword, randomToken, sha256Hex } from "./security.js";

// 課金トライアル日数（販売仕様: 7日間無料で試す）。
export const BILLING_TRIAL_DAYS = 7;
// パスワード設定リンクの有効日数。
export const PASSWORD_SET_TTL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PLAN_TYPE = "lite";
const DEFAULT_PAYMENT_METHOD = "paypal";
const DEFAULT_AMOUNT_JPY = 1980;

export function isProPlan(plan) {
  return plan === "pro" || plan === "admin_full";
}

export function isPaidPlan(plan) {
  return plan === "lite" || isProPlan(plan);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ----------------------------------------------------------------------------
// データアクセス（テストでモック差し替えしやすいよう 1 クエリ = 1 関数）
// ----------------------------------------------------------------------------

async function findUserByEmail(env, email) {
  return env.DB.prepare("SELECT * FROM users WHERE email = ? LIMIT 1").bind(email).first();
}

async function findPurchaseByTransaction(env, transactionId) {
  if (!transactionId) return null;
  return env.DB
    .prepare("SELECT * FROM purchase_history WHERE transaction_id = ? LIMIT 1")
    .bind(transactionId)
    .first();
}

async function insertNewPaidUser(env, user) {
  await env.DB.prepare(`
    INSERT INTO users (
      id, email, display_name, password_hash, role, plan, status,
      plan_start_date, paypal_subscription_id,
      password_set_token_hash, password_set_expires_at,
      trial_started_at, trial_expires_at, trial_status,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, 'user', ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    user.id,
    user.email,
    user.displayName || null,
    user.passwordHash,
    user.plan,
    user.planStartDate,
    user.subscriptionId || null,
    user.passwordSetTokenHash || null,
    user.passwordSetExpiresAt || null,
    user.trialStartedAt,
    user.trialExpiresAt,
    user.trialStatus,
    user.now,
    user.now
  ).run();
}

async function updateExistingPaidUser(env, user) {
  await env.DB.prepare(`
    UPDATE users
    SET plan = ?,
        status = 'active',
        plan_start_date = COALESCE(plan_start_date, ?),
        plan_cancel_date = NULL,
        paypal_subscription_id = ?,
        password_set_token_hash = ?,
        password_set_expires_at = ?,
        trial_started_at = COALESCE(trial_started_at, ?),
        trial_expires_at = ?,
        trial_status = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(
    user.plan,
    user.planStartDate,
    user.subscriptionId || null,
    user.passwordSetTokenHash || null,
    user.passwordSetExpiresAt || null,
    user.trialStartedAt,
    user.trialExpiresAt,
    user.trialStatus,
    user.now,
    user.id
  ).run();
}

async function insertPurchaseRow(env, purchase) {
  await env.DB.prepare(`
    INSERT INTO purchase_history (
      id, user_id, email, plan_type, payment_method, amount_jpy,
      status, transaction_id, subscription_id, raw_event_type,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    purchase.id,
    purchase.userId || null,
    purchase.email || null,
    purchase.planType || null,
    purchase.paymentMethod,
    purchase.amountJpy ?? null,
    purchase.status,
    purchase.transactionId || null,
    purchase.subscriptionId || null,
    purchase.rawEventType || null,
    purchase.createdAt,
    purchase.updatedAt
  ).run();
}

async function markSubscriptionCanceled(env, subscriptionId, now) {
  await env.DB.prepare(`
    UPDATE users
    SET plan_cancel_date = ?, updated_at = ?
    WHERE paypal_subscription_id = ?
  `).bind(now, now, subscriptionId).run();
}

// ----------------------------------------------------------------------------
// パスワード設定トークン（ワンタイム）
// ----------------------------------------------------------------------------

export async function createPasswordSetToken(env, { now = new Date(), ttlDays = PASSWORD_SET_TTL_DAYS } = {}) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token, env.APP_SECRET || "");
  const expiresAt = new Date(now.getTime() + ttlDays * DAY_MS).toISOString();
  return { token, tokenHash, expiresAt };
}

export async function hashPasswordSetToken(env, token) {
  return sha256Hex(token, env.APP_SECRET || "");
}

export function passwordSetUrl(env, token) {
  const base = String(env.APP_BASE_URL || "").replace(/\/+$/, "");
  const path = `/set-password.html?token=${encodeURIComponent(token)}`;
  return base ? `${base}${path}` : path;
}

// ----------------------------------------------------------------------------
// 購入記録（冪等）
// ----------------------------------------------------------------------------

export async function recordPurchase(env, options = {}) {
  const transactionId = options.transactionId || null;
  if (transactionId) {
    const existing = await findPurchaseByTransaction(env, transactionId);
    if (existing) return { recorded: false, alreadyProcessed: true, purchase: existing };
  }

  const now = (options.now instanceof Date ? options.now : new Date()).toISOString();
  const purchase = {
    id: options.id || cryptoRandomUUID(),
    userId: options.userId || null,
    email: options.email ? normalizeEmail(options.email) : null,
    planType: options.planType || DEFAULT_PLAN_TYPE,
    paymentMethod: options.paymentMethod || DEFAULT_PAYMENT_METHOD,
    amountJpy: options.amountJpy ?? null,
    status: options.status || "completed",
    transactionId,
    subscriptionId: options.subscriptionId || null,
    rawEventType: options.rawEventType || null,
    createdAt: now,
    updatedAt: now
  };

  await insertPurchaseRow(env, purchase);
  return { recorded: true, alreadyProcessed: false, purchase };
}

// ----------------------------------------------------------------------------
// 決済後プロビジョニング（メイン）
// ----------------------------------------------------------------------------

export async function provisionPaidUser(env, options = {}) {
  if (!env.DB) throw new Error("D1 binding is not configured");

  const email = normalizeEmail(options.email);
  if (!isEmail(email)) {
    return { ok: false, reason: "INVALID_EMAIL" };
  }

  const transactionId = options.transactionId || null;
  if (transactionId) {
    const existing = await findPurchaseByTransaction(env, transactionId);
    if (existing) {
      return { ok: true, alreadyProcessed: true, userId: existing.user_id || null };
    }
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const nowIso = now.toISOString();
  const plan = options.planType || DEFAULT_PLAN_TYPE;
  const trialDays = Number.isFinite(options.trialDays) ? options.trialDays : BILLING_TRIAL_DAYS;
  const trialStartedAt = nowIso;
  const trialExpiresAt = new Date(now.getTime() + trialDays * DAY_MS).toISOString();
  const trialStatus = "active";

  const existingUser = await findUserByEmail(env, email);

  // 管理者アカウントには触れない（プラン降格・上書きを防ぐ）。購入記録だけ残す。
  if (existingUser && existingUser.role === "admin") {
    const purchase = await recordPurchase(env, {
      userId: existingUser.id,
      email,
      planType: plan,
      paymentMethod: options.paymentMethod,
      amountJpy: options.amountJpy ?? DEFAULT_AMOUNT_JPY,
      subscriptionId: options.subscriptionId,
      rawEventType: options.rawEventType,
      now
    });
    return {
      ok: true,
      userId: existingUser.id,
      isAdmin: true,
      passwordSetToken: null,
      purchase: purchase.purchase
    };
  }

  // 既存ユーザー（パスワード設定済み）は再設定トークンを発行しない。
  const needsPasswordSetup = !existingUser || !existingUser.password_hash;
  let passwordSet = null;
  if (needsPasswordSetup) {
    passwordSet = await createPasswordSetToken(env, { now });
  }

  let userId;
  if (existingUser) {
    userId = existingUser.id;
    await updateExistingPaidUser(env, {
      id: userId,
      plan,
      planStartDate: nowIso,
      subscriptionId: options.subscriptionId,
      passwordSetTokenHash: passwordSet ? passwordSet.tokenHash : null,
      passwordSetExpiresAt: passwordSet ? passwordSet.expiresAt : null,
      trialStartedAt,
      trialExpiresAt,
      trialStatus,
      now: nowIso
    });
  } else {
    userId = options.userId || cryptoRandomUUID();
    // 初回はパスワード未設定。NOT NULL を満たすため使い捨て不可ハッシュを入れておく。
    const placeholderHash = await hashPassword(randomToken(24), env.APP_SECRET || "");
    await insertNewPaidUser(env, {
      id: userId,
      email,
      displayName: options.name || null,
      passwordHash: placeholderHash,
      plan,
      planStartDate: nowIso,
      subscriptionId: options.subscriptionId,
      passwordSetTokenHash: passwordSet ? passwordSet.tokenHash : null,
      passwordSetExpiresAt: passwordSet ? passwordSet.expiresAt : null,
      trialStartedAt,
      trialExpiresAt,
      trialStatus,
      now: nowIso
    });
  }

  const purchase = await recordPurchase(env, {
    userId,
    email,
    planType: plan,
    paymentMethod: options.paymentMethod,
    amountJpy: options.amountJpy ?? DEFAULT_AMOUNT_JPY,
    transactionId,
    subscriptionId: options.subscriptionId,
    rawEventType: options.rawEventType,
    now
  });

  return {
    ok: true,
    userId,
    isNewUser: !existingUser,
    passwordSetToken: passwordSet ? passwordSet.token : null,
    passwordSetExpiresAt: passwordSet ? passwordSet.expiresAt : null,
    trialExpiresAt,
    purchase: purchase.purchase
  };
}

export async function cancelSubscription(env, options = {}) {
  if (!options.subscriptionId) return { ok: false, reason: "NO_SUBSCRIPTION_ID" };
  const now = (options.now instanceof Date ? options.now : new Date()).toISOString();
  await markSubscriptionCanceled(env, options.subscriptionId, now);
  if (options.transactionId || options.recordEvent) {
    await recordPurchase(env, {
      email: options.email,
      planType: options.planType,
      paymentMethod: options.paymentMethod,
      amountJpy: options.amountJpy ?? null,
      status: "canceled",
      transactionId: options.transactionId,
      subscriptionId: options.subscriptionId,
      rawEventType: options.rawEventType,
      now: options.now
    });
  }
  return { ok: true };
}

// ----------------------------------------------------------------------------
// 取引メール（Resend）。EMAIL_API_KEY / EMAIL_FROM 未設定なら no-op。
// ----------------------------------------------------------------------------

export async function sendTransactionalEmail(env, { to, subject, html, text } = {}) {
  if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) {
    return { sent: false, skipped: true, reason: "EMAIL_NOT_CONFIGURED" };
  }
  if (!to || !subject || (!html && !text)) {
    return { sent: false, skipped: true, reason: "INVALID_EMAIL_PAYLOAD" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || undefined,
      text: text || undefined
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { sent: false, skipped: false, status: response.status, error: body.slice(0, 500) };
  }

  const data = await response.json().catch(() => ({}));
  return { sent: true, id: data.id || null };
}

export function buildWelcomeEmail({ name, setPasswordUrl, planLabel = "Lite", trialDays = BILLING_TRIAL_DAYS } = {}) {
  const greeting = name ? `${name} 様` : "ご購入ありがとうございます";
  const subject = "【SNS MNM-PRO】ご購入ありがとうございます｜パスワード設定のご案内";
  const text = [
    `${greeting}`,
    "",
    "SNS MNM-PRO をご購入いただきありがとうございます。",
    `現在 ${planLabel} プランで、${trialDays}日間の無料トライアルが始まっています。`,
    "",
    "下記リンクからパスワードを設定すると、すぐにログインしてご利用いただけます。",
    setPasswordUrl,
    "",
    `※このリンクの有効期限は ${PASSWORD_SET_TTL_DAYS} 日間です。`,
    "※トライアル期間中はいつでも解約でき、料金は発生しません。",
    "",
    "SNS MNM-PRO 運営"
  ].join("\n");

  const html = `
  <div style="font-family:-apple-system,'Hiragino Sans',sans-serif;max-width:560px;margin:0 auto;color:#1f2937;line-height:1.7">
    <p>${greeting}</p>
    <p>SNS MNM-PRO をご購入いただきありがとうございます。<br>
    現在 <strong>${planLabel}</strong> プランで、<strong>${trialDays}日間の無料トライアル</strong>が始まっています。</p>
    <p>下記ボタンからパスワードを設定すると、すぐにログインしてご利用いただけます。</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${setPasswordUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:bold">パスワードを設定する</a>
    </p>
    <p style="font-size:13px;color:#6b7280">ボタンが押せない場合は次のURLを開いてください：<br>
    <a href="${setPasswordUrl}">${setPasswordUrl}</a></p>
    <p style="font-size:13px;color:#6b7280">※このリンクの有効期限は ${PASSWORD_SET_TTL_DAYS} 日間です。<br>
    ※トライアル期間中はいつでも解約でき、料金は発生しません。</p>
    <p style="margin-top:24px">SNS MNM-PRO 運営</p>
  </div>`.trim();

  return { subject, html, text };
}

// crypto.randomUUID をラップ（古い実行環境向けフォールバック）。
function cryptoRandomUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
