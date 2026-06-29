// 公開設定: フロントの PayPal サブスクボタン用。Client ID と Plan ID は
// 公開して問題ない値（Secret ではない）。Secret は一切返さない。

export async function onRequestGet({ env }) {
  const clientId = env.PAYPAL_CLIENT_ID || "";
  const planId = env.PAYPAL_PLAN_ID || "";
  const environment = String(env.PAYPAL_ENV || "sandbox").toLowerCase();
  return Response.json({
    ok: Boolean(clientId && planId),
    configured: Boolean(clientId && planId),
    client_id: clientId,
    plan_id: planId,
    env: environment
  });
}
