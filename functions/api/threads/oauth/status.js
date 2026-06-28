import { connectionView, getThreadsAppSettings, getThreadsSessionUser, json } from "../../../_lib/threads-oauth.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await getThreadsSessionUser(env, request);
    const row = await env.DB.prepare(`
      SELECT auth_type, threads_user_id, access_token_last4, token_expires_at,
             connection_status, last_tested_at, last_synced_at, oauth_connected_at
      FROM threads_connections
      WHERE user_id = ?
      LIMIT 1
    `).bind(user.userId).first();
    const app = await getThreadsAppSettings(env);
    return json({
      ok: true,
      app_configured: Boolean(app.appId && app.secretLast4),
      redirect_uri: new URL("/api/threads/oauth/callback", request.url).toString(),
      connection: connectionView(row || { connection_status: "disconnected", auth_type: "oauth" })
    });
  } catch {
    return json({ ok: false, error_code: "THREADS_OAUTH_STATUS_FAILED", message: "Threads連携状態を取得できませんでした" }, 401);
  }
}
