import { requireAdminUser } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) throw new Error("D1 binding is not configured");
    await requireAdminUser(env, request);

    const rows = await env.DB.prepare(`
      SELECT
        licenses.id,
        licenses.license_last4,
        licenses.email,
        licenses.plan,
        licenses.status,
        licenses.issued_at,
        licenses.expires_at,
        licenses.buyer_name,
        licenses.payment_name,
        licenses.stripe_payment_id,
        licenses.memo,
        licenses.user_id,
        users.display_name
      FROM licenses
      LEFT JOIN users ON users.id = licenses.user_id
      ORDER BY licenses.issued_at DESC
    `).all();

    return Response.json({
      ok: true,
      licenses: (rows.results || []).map((row) => ({
        id: row.id,
        key_masked: row.license_last4 ? `SNS-MNM-****-****-${row.license_last4}` : "SNS-MNM-****-****-****",
        license_last4: row.license_last4,
        email: row.email,
        plan: row.plan,
        status: row.status,
        issued_at: row.issued_at,
        expires_at: row.expires_at,
        buyer_name: row.buyer_name || row.display_name || null,
        payment_name: row.payment_name || null,
        stripe_payment_id: row.stripe_payment_id || null,
        memo: row.memo || null,
        user_id: row.user_id || null
      }))
    });
  } catch {
    return Response.json({ ok: false, error: "ライセンス一覧を取得できませんでした。" }, { status: 500 });
  }
}
