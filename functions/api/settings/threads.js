import { getAppSessionUser } from "../../_lib/auth.js";
import { encryptString, last4 } from "../../_lib/security.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await getAppSessionUser(env, request);
    const row = await env.DB.prepare(`
      SELECT meta_app_id, meta_app_secret_last4, threads_user_id, access_token_last4,
             token_expires_at, connection_status, last_tested_at, last_synced_at,
             previous_follower_count, current_follower_count, current_value_at
      FROM threads_connections WHERE user_id = ? LIMIT 1
    `).bind(user.userId).first();
    return Response.json({ ok: true, connection: row || { connection_status: "disconnected" } });
  } catch {
    return Response.json({ ok: false, error: "ログインが必要です" }, { status: 401 });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || !env.THREADS_ENCRYPTION_KEY) throw new Error("Threads settings bindings are not configured");
    const user = await getAppSessionUser(env, request);
    const input = await readJson(request);
    const metaAppId = String(input.meta_app_id || input.metaAppId || "").trim();
    const metaAppSecret = String(input.meta_app_secret || input.metaAppSecret || "").trim();
    const threadsUserId = String(input.threads_user_id || input.threadsUserId || "").trim();
    const accessToken = String(input.access_token || input.accessToken || "").trim();
    const tokenExpiresAt = String(input.token_expires_at || input.tokenExpiresAt || "").trim() || null;

    if (!metaAppId || !threadsUserId || !accessToken) {
      return fail("Meta App ID、Threads User ID、Access Tokenを入力してください。", 400);
    }

    const now = new Date().toISOString();
    const existing = await env.DB.prepare("SELECT id, meta_app_secret_encrypted FROM threads_connections WHERE user_id = ? LIMIT 1")
      .bind(user.userId)
      .first();
    const encryptedSecret = metaAppSecret
      ? await encryptString(metaAppSecret, env.THREADS_ENCRYPTION_KEY)
      : existing?.meta_app_secret_encrypted || null;
    const encryptedToken = await encryptString(accessToken, env.THREADS_ENCRYPTION_KEY);
    const secretLast4 = metaAppSecret ? last4(metaAppSecret) : null;

    if (existing) {
      await env.DB.prepare(`
        UPDATE threads_connections
        SET meta_app_id = ?, meta_app_secret_encrypted = ?, meta_app_secret_last4 = COALESCE(?, meta_app_secret_last4),
            threads_user_id = ?, access_token_encrypted = ?, access_token_last4 = ?, token_expires_at = ?,
            connection_status = 'disconnected', updated_at = ?
        WHERE user_id = ?
      `).bind(metaAppId, encryptedSecret, secretLast4, threadsUserId, encryptedToken, last4(accessToken), tokenExpiresAt, now, user.userId).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO threads_connections (
          id, user_id, meta_app_id, meta_app_secret_encrypted, meta_app_secret_last4,
          threads_user_id, access_token_encrypted, access_token_last4, token_expires_at,
          connection_status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'disconnected', ?, ?)
      `).bind(
        crypto.randomUUID(),
        user.userId,
        metaAppId,
        encryptedSecret,
        secretLast4,
        threadsUserId,
        encryptedToken,
        last4(accessToken),
        tokenExpiresAt,
        now,
        now
      ).run();
    }

    return Response.json({
      ok: true,
      connection: {
        meta_app_id: metaAppId,
        meta_app_secret_last4: secretLast4 || undefined,
        threads_user_id: threadsUserId,
        access_token_last4: last4(accessToken),
        token_expires_at: tokenExpiresAt,
        connection_status: "disconnected"
      }
    });
  } catch {
    return fail("Threads API設定の保存に失敗しました。", 500);
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function fail(message, status) {
  return Response.json({ ok: false, error: message }, { status });
}
