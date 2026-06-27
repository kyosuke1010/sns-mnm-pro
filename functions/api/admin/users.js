import { requireAdminUser } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) throw new Error("D1 binding is not configured");
    await requireAdminUser(env, request);

    const rows = await env.DB.prepare(`
      SELECT
        users.id,
        users.display_name,
        users.email,
        users.role,
        users.plan,
        users.status,
        users.created_at,
        users.last_login_at,
        licenses.license_last4,
        licenses.status AS license_status
      FROM users
      LEFT JOIN licenses
        ON licenses.id = (
          SELECT l.id
          FROM licenses l
          WHERE l.user_id = users.id
          ORDER BY COALESCE(l.activated_at, l.issued_at) DESC
          LIMIT 1
        )
      ORDER BY users.created_at DESC
    `).all();

    return Response.json({
      ok: true,
      users: (rows.results || []).map((row) => ({
        id: row.id,
        name: row.display_name || "未設定",
        email: row.email,
        role: row.role,
        plan: row.plan,
        status: row.status,
        created_at: row.created_at,
        last_login_at: row.last_login_at,
        license_last4: row.license_last4 || null,
        license_status: row.license_status || null
      }))
    });
  } catch {
    return Response.json({ ok: false, error: "ユーザー一覧を取得できませんでした" }, { status: 500 });
  }
}
