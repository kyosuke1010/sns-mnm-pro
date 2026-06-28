import { decryptString } from "../../_lib/security.js";
import { connectionView, getThreadsSessionUser, json } from "../../_lib/threads-oauth.js";

export async function onRequestPost({ request, env }) {
  const payload = await safeJson(request);
  const connection = await resolveConnection({ request, env, payload });
  if (!connection.ok) return json({ ok: false, message: connection.message }, connection.status);

  if (env.THREADS_LIVE_TEST !== "true") {
    return json({
      ok: true,
      mode: "dry-run",
      message: "投稿一覧取得テスト形式の確認に成功しました。実API取得はTHREADS_LIVE_TEST有効化後に行います。",
      posts: [
        { id: "dryrun_001", text: "Threads API接続後に取得する投稿サンプル", timestamp: "2026-06-21T09:00:00+09:00" }
      ],
      connection: connectionView(connection.row)
    });
  }

  const url = new URL(`https://graph.threads.net/v1.0/${encodeURIComponent(connection.threadsUserId)}/threads`);
  url.searchParams.set("fields", "id,text,timestamp,permalink");
  url.searchParams.set("limit", "10");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${connection.accessToken}` }
  });
  if (!response.ok) {
    return json({ ok: false, message: "投稿一覧取得に失敗しました。権限、Token、有効期限を確認してください。" }, response.status);
  }
  const data = await response.json();
  return json({ ok: true, mode: "live", message: "投稿一覧取得に成功しました。", posts: data.data || [] });
}

async function resolveConnection({ request, env, payload }) {
  if (payload?.threadsUserId && payload?.accessToken) {
    return { ok: true, threadsUserId: payload.threadsUserId, accessToken: payload.accessToken, row: { connection_status: "connected", threads_user_id: payload.threadsUserId } };
  }
  try {
    const user = await getThreadsSessionUser(env, request);
    const row = await env.DB.prepare(`
      SELECT threads_user_id, access_token_encrypted, access_token_last4, token_expires_at,
             connection_status, auth_type, last_tested_at, last_synced_at, oauth_connected_at
      FROM threads_connections
      WHERE user_id = ? AND access_token_encrypted IS NOT NULL
      LIMIT 1
    `).bind(user.userId).first();
    if (!row?.threads_user_id || !row?.access_token_encrypted) {
      return { ok: false, status: 400, message: "Threads連携が未設定です。設定画面からThreadsと連携してください。" };
    }
    const accessToken = await decryptString(row.access_token_encrypted, env.THREADS_ENCRYPTION_KEY);
    return { ok: true, threadsUserId: row.threads_user_id, accessToken, row };
  } catch {
    return { ok: false, status: 401, message: "ログインが必要です" };
  }
}

async function safeJson(request) {
  try { return await request.json(); } catch { return {}; }
}
