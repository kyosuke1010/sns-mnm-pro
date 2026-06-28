import { decryptString, encryptString, last4 } from "../../../_lib/security.js";
import { connectionView, getThreadsSessionUser, json, refreshLongLivedToken, tokenDates } from "../../../_lib/threads-oauth.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await getThreadsSessionUser(env, request);
    const row = await env.DB.prepare(`
      SELECT id, access_token_encrypted, token_expires_at, token_refresh_after_at
      FROM threads_connections
      WHERE user_id = ? AND auth_type = 'oauth'
      LIMIT 1
    `).bind(user.userId).first();
    if (!row?.access_token_encrypted) {
      return json({ ok: false, error_code: "THREADS_NOT_CONNECTED", message: "Threads連携が未設定です" }, 400);
    }
    if (row.token_refresh_after_at && new Date(row.token_refresh_after_at).getTime() > Date.now()) {
      return json({ ok: false, error_code: "THREADS_REFRESH_TOO_EARLY", message: "トークン更新は連携から24時間後に利用できます" }, 400);
    }

    const currentToken = await decryptString(row.access_token_encrypted, env.THREADS_ENCRYPTION_KEY);
    const refreshed = await refreshLongLivedToken({ accessToken: currentToken });
    const dates = tokenDates(new Date(), refreshed.expires_in);
    const encryptedToken = await encryptString(refreshed.access_token, env.THREADS_ENCRYPTION_KEY);
    const now = new Date().toISOString();

    await env.DB.prepare(`
      UPDATE threads_connections
      SET access_token_encrypted = ?,
          access_token_last4 = ?,
          token_expires_at = ?,
          token_issued_at = ?,
          token_refresh_after_at = ?,
          token_refresh_due_at = ?,
          token_last_refreshed_at = ?,
          connection_status = 'connected',
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at = ?
      WHERE id = ?
    `).bind(
      encryptedToken,
      last4(refreshed.access_token),
      dates.expiresAt,
      dates.issuedAt,
      dates.refreshAfterAt,
      dates.refreshDueAt,
      now,
      now,
      row.id
    ).run();

    const updated = await env.DB.prepare(`
      SELECT auth_type, threads_user_id, access_token_last4, token_expires_at,
             connection_status, last_tested_at, last_synced_at, oauth_connected_at
      FROM threads_connections WHERE id = ? LIMIT 1
    `).bind(row.id).first();
    return json({ ok: true, message: "Threadsトークンを更新しました", connection: connectionView(updated) });
  } catch {
    return json({ ok: false, error_code: "THREADS_REFRESH_FAILED", message: "Threadsトークンを更新できませんでした。再連携してください" }, 500);
  }
}
