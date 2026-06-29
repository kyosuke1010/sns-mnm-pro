// 管理者専用: PayPal の Product + サブスクPlan を作成して Plan ID を返す。
// 認証情報は Cloudflare の環境変数（PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET /
// PAYPAL_ENV）からのみ読む。シークレットはレスポンスに含めない。
// このパス(/api/admin/*)は _middleware.js で管理者セッション必須。

import { requireAdminUser } from "../../_lib/auth.js";

function paypalBase(env) {
  return String(env.PAYPAL_ENV || "sandbox").toLowerCase() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken(env, base) {
  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error("token");
    err.detail = { status: res.status, body: data };
    throw err;
  }
  return data.access_token;
}

export async function onRequestGet({ request, env }) {
  await requireAdminUser(env, request);
  return Response.json({
    ok: true,
    env: String(env.PAYPAL_ENV || "sandbox").toLowerCase(),
    credentials_configured: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
    plan_id_configured: Boolean(env.PAYPAL_PLAN_ID)
  });
}

export async function onRequestPost({ request, env }) {
  await requireAdminUser(env, request);

  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    return Response.json(
      { ok: false, error: "Cloudflareの環境変数 PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET が未設定です。登録して再デプロイ後にお試しください。" },
      { status: 400 }
    );
  }

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const priceJpy = String(body.price_jpy || env.PAYPAL_PRICE_JPY || "1980").replace(/[^0-9]/g, "") || "1980";
  const trialDays = Number(String(body.trial_days || env.PAYPAL_TRIAL_DAYS || "7").replace(/[^0-9]/g, "")) || 7;

  const base = paypalBase(env);

  try {
    const token = await getAccessToken(env, base);

    const productRes = await fetch(`${base}/v1/catalogs/products`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `snsmnm-product-${Date.now()}`
      },
      body: JSON.stringify({
        name: "SNS MNM-PRO",
        description: "AI×Threads運用支援ツール",
        type: "SERVICE",
        category: "SOFTWARE"
      })
    });
    const product = await productRes.json().catch(() => ({}));
    if (!productRes.ok) {
      return Response.json({ ok: false, error: "Product作成に失敗しました。", detail: safeDetail(product) }, { status: 502 });
    }

    const planRes = await fetch(`${base}/v1/billing/plans`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `snsmnm-plan-${Date.now()}`
      },
      body: JSON.stringify({
        product_id: product.id,
        name: "SNS MNM-PRO Lite",
        description: `Lite プラン 月額 ¥${priceJpy}（${trialDays}日間無料トライアル付き）`,
        status: "ACTIVE",
        billing_cycles: [
          {
            frequency: { interval_unit: "DAY", interval_count: trialDays },
            tenure_type: "TRIAL",
            sequence: 1,
            total_cycles: 1,
            pricing_scheme: { fixed_price: { value: "0", currency_code: "JPY" } }
          },
          {
            frequency: { interval_unit: "MONTH", interval_count: 1 },
            tenure_type: "REGULAR",
            sequence: 2,
            total_cycles: 0,
            pricing_scheme: { fixed_price: { value: priceJpy, currency_code: "JPY" } }
          }
        ],
        payment_preferences: {
          auto_bill_outstanding: true,
          setup_fee: { value: "0", currency_code: "JPY" },
          setup_fee_failure_action: "CONTINUE",
          payment_failure_threshold: 3
        }
      })
    });
    const plan = await planRes.json().catch(() => ({}));
    if (!planRes.ok) {
      return Response.json({ ok: false, error: "Plan作成に失敗しました。", detail: safeDetail(plan) }, { status: 502 });
    }

    return Response.json({
      ok: true,
      env: String(env.PAYPAL_ENV || "sandbox").toLowerCase(),
      product_id: product.id,
      plan_id: plan.id,
      price_jpy: priceJpy,
      trial_days: trialDays,
      next_step: "この plan_id を Cloudflare の環境変数 PAYPAL_PLAN_ID に登録してください。"
    });
  } catch (error) {
    const detail = error?.detail ? safeDetail(error.detail.body) : null;
    const status = error?.detail?.status === 401 ? 401 : 502;
    const message = status === 401
      ? "PayPal認証に失敗しました。Client ID / Secret と Sandbox/Live(PAYPAL_ENV)の組み合わせを確認してください。"
      : "PayPalへのリクエストに失敗しました。時間をおいて再度お試しください。";
    return Response.json({ ok: false, error: message, detail }, { status });
  }
}

// PayPalのエラー本文から、デバッグに有用な最小情報だけ返す（トークン等は含めない）。
function safeDetail(body) {
  if (!body || typeof body !== "object") return null;
  return {
    name: body.name || null,
    message: body.message || null,
    details: Array.isArray(body.details)
      ? body.details.slice(0, 3).map((d) => ({ issue: d.issue, description: d.description }))
      : null
  };
}
