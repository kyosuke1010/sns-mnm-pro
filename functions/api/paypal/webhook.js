// PayPal Webhook 受信口。署名を検証し、サブスク開始で購入者を自動プロビジョン。
// 認証情報は env から読む（PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET /
// PAYPAL_ENV / PAYPAL_WEBHOOK_ID）。検証に失敗したリクエストは処理しない。

import {
  provisionPaidUser,
  cancelSubscription,
  recordPurchase,
  sendTransactionalEmail,
  buildWelcomeEmail,
  passwordSetUrl
} from "../../_lib/billing.js";

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
  if (!res.ok) throw new Error("paypal_token_failed");
  const data = await res.json();
  return data.access_token;
}

async function verifySignature(env, base, token, request, rawBody) {
  const event = JSON.parse(rawBody);
  const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      transmission_id: request.headers.get("paypal-transmission-id"),
      transmission_time: request.headers.get("paypal-transmission-time"),
      cert_url: request.headers.get("paypal-cert-url"),
      auth_algo: request.headers.get("paypal-auth-algo"),
      transmission_sig: request.headers.get("paypal-transmission-sig"),
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: event
    })
  });
  const data = await res.json().catch(() => ({}));
  return { ok: data.verification_status === "SUCCESS", event };
}

export async function onRequestPost({ request, env }) {
  // 設定不足は 400（PayPal側は再送する。env を整えれば回復する）。
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET || !env.PAYPAL_WEBHOOK_ID) {
    return Response.json({ ok: false, error: "paypal_webhook_not_configured" }, { status: 400 });
  }

  const rawBody = await request.text();
  const base = paypalBase(env);

  let event;
  try {
    const token = await getAccessToken(env, base);
    const verified = await verifySignature(env, base, token, request, rawBody);
    if (!verified.ok) {
      return Response.json({ ok: false, error: "signature_verification_failed" }, { status: 401 });
    }
    event = verified.event;
  } catch {
    // 一時的な失敗。PayPal は再送するので 500 を返す。
    return Response.json({ ok: false, error: "verify_error" }, { status: 500 });
  }

  const type = event.event_type || "";
  const resource = event.resource || {};
  const appBase = env.APP_BASE_URL || new URL(request.url).origin;

  try {
    if (type === "BILLING.SUBSCRIPTION.ACTIVATED") {
      const email = resource?.subscriber?.email_address || "";
      const name = [resource?.subscriber?.name?.given_name, resource?.subscriber?.name?.surname]
        .filter(Boolean).join(" ");
      const result = await provisionPaidUser(env, {
        email,
        name,
        subscriptionId: resource.id,
        transactionId: event.id, // webhook event id で冪等化
        amountJpy: 1980,
        paymentMethod: "paypal",
        planType: "lite",
        rawEventType: type
      });

      // パスワード設定リンクをメール送信（Resend 未設定なら no-op）。
      if (result.ok && result.passwordSetToken) {
        const url = passwordSetUrl({ APP_BASE_URL: appBase }, result.passwordSetToken);
        const mail = buildWelcomeEmail({ name, setPasswordUrl: url, planLabel: "Lite" });
        await sendTransactionalEmail(env, { to: email, subject: mail.subject, html: mail.html, text: mail.text });
      }
      return Response.json({ ok: true, handled: type, provisioned: Boolean(result.ok) });
    }

    if (type === "BILLING.SUBSCRIPTION.CANCELLED" || type === "BILLING.SUBSCRIPTION.SUSPENDED") {
      await cancelSubscription(env, {
        subscriptionId: resource.id,
        transactionId: event.id,
        recordEvent: true,
        rawEventType: type
      });
      return Response.json({ ok: true, handled: type });
    }

    if (type === "PAYMENT.SALE.COMPLETED" || type === "PAYMENT.CAPTURE.COMPLETED") {
      const amount = resource?.amount?.total || resource?.amount?.value || null;
      await recordPurchase(env, {
        transactionId: event.id,
        subscriptionId: resource.billing_agreement_id || resource.id || null,
        amountJpy: amount ? Math.round(Number(amount)) : null,
        paymentMethod: "paypal",
        status: "completed",
        rawEventType: type
      });
      return Response.json({ ok: true, handled: type });
    }

    // 関心のないイベントは 200 で受理（PayPal の再送を止める）。
    return Response.json({ ok: true, handled: false, type });
  } catch (error) {
    // 処理失敗は 500 で返し、PayPal に再送させる。
    return Response.json({ ok: false, error: "handler_error", detail: String(error?.message || error) }, { status: 500 });
  }
}
