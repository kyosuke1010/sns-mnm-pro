import { getThreadsSessionUser, json } from "../../../_lib/threads-oauth.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await getThreadsSessionUser(env, request);
    await env.DB.prepare(`
      UPDATE threads_connections
      SET access_token_encrypted = NULL,
          access_token_last4 = NULL,
          token_expires_at = NULL,
          connection_status = 'disconnected',
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at = ?
      WHERE user_id = ?
    `).bind(new Date().toISOString(), user.userId).run();
    return json({ ok: true, message: "Threads連携を解除しました" });
  } catch {
    return json({ ok: false, error_code: "THREADS_DISCONNECT_FAILED", message: "Threads連携を解除できませんでした" }, 500);
  }
}
