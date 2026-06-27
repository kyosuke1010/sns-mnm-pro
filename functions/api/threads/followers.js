import { getAppSessionUser } from "../../_lib/auth.js";
import { decryptString } from "../../_lib/security.js";
import { connectionView, json } from "../../_lib/threads-oauth.js";

export async function onRequestPost({ request, env }) {
  const payload = await safeJson(request);
  const connection = await resolveConnection({ request, env, payload });
  if (!connection.ok) return json({ ok: false, message: connection.message }, connection.status);

  if (env.THREADS_LIVE_TEST !== "true") {
    return json({
      ok: true,
      mode: "dry-run",
      followers: { previous: 10520, current: 12480 },
      message: "フォロワー数取得テスト形式の確認に成功しました。実API取得はTHREADS_LIVE_TEST有効化後に行います。",
      connection: connectionView(connection.row)
    });
  }

  const url = new URL(`https://graph.threads.net/v1.0/${encodeURIComponent(connection.threadsUserId)}`);
  url.searchParams.set("fields", "id,username,follower_count");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${connection.accessToken}` }
  });
  if (!response.ok) {
    return json({ ok: false, message: "フォロワー数取得に失敗しました。権限、Token、有効期限を確認してください。" }, response.status);
  }
  const data = await response.json();
  const current = Number(data.follower_count || 0);
  const previous = Number(connection.row?.current_follower_count || payload.previousFollowers || 0);
  const now = new Date().toISOString();
  if (connection.userId) {
    await env.DB.prepare(`
      UPDATE threads_connections
      SET previous_follower_count = COALESCE(current_follower_count, ?),
          current_follower_count = ?,
          current_value_at = ?,
          last_synced_at = ?,
          connection_status = 'connected',
          updated_at = ?
      WHERE user_id = ?
    `).bind(previous, current, now, now, now, connection.userId).run();
  }
  return json({
    ok: true,
    mode: "live",
    followers: { previous, current },
    message: "フォロワー数取得に成功しました。"
  });
}

async function resolveConnection({ request, env, payload }) {
  if (payload?.threadsUserId && payload?.accessToken) {
    return { ok: true, threadsUserId: payload.threadsUserId, accessToken: payload.accessToken, row: { connection_status: "connected", threads_user_id: payload.threadsUserId } };
  }
  try {
    const user = await getAppSessionUser(env, request);
    const row = await env.DB.prepare(`
      SELECT threads_user_id, access_token_encrypted, access_token_last4, token_expires_at,
             connection_status, auth_type, last_tested_at, last_synced_at, oauth_connected_at,
             previous_follower_count, current_follower_count
      FROM threads_connections
      WHERE user_id = ? AND access_token_encrypted IS NOT NULL
      LIMIT 1
    `).bind(user.userId).first();
    if (!row?.threads_user_id || !row?.access_token_encrypted) {
      return { ok: false, status: 400, message: "Threads連携が未設定です。設定画面からThreadsと連携してください。" };
    }
    const accessToken = await decryptString(row.access_token_encrypted, env.THREADS_ENCRYPTION_KEY);
    return { ok: true, userId: user.userId, threadsUserId: row.threads_user_id, accessToken, row };
  } catch {
    return { ok: false, status: 401, message: "ログインが必要です" };
  }
}

async function safeJson(request) {
  try { return await request.json(); } catch { return {}; }
}
