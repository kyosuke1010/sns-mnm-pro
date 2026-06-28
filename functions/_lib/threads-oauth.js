import { decryptString, encryptString, last4, randomToken } from "./security.js";
import { AuthError, getSessionUser, SESSION_SCOPE_ADMIN, SESSION_SCOPE_USER } from "./auth.js";

// Threads connection is used by buyers (user session) and by the admin who
// manages the dedicated account. Resolve whichever authenticated session is
// present so the connect/status/refresh/disconnect flow works for both.
export async function getThreadsSessionUser(env, request) {
  try {
    return await getSessionUser(env, request, SESSION_SCOPE_USER);
  } catch (error) {
    if (error instanceof AuthError) {
      return await getSessionUser(env, request, SESSION_SCOPE_ADMIN);
    }
    throw error;
  }
}

export const THREADS_SCOPES = [
  "threads_basic",
  "threads_content_publish"
];

export const THREADS_AUTHORIZE_URL = "https://threads.net/oauth/authorize";
export const THREADS_TOKEN_URL = "https://graph.threads.net/oauth/access_token";
export const THREADS_LONG_LIVED_URL = "https://graph.threads.net/access_token";
export const THREADS_REFRESH_URL = "https://graph.threads.net/refresh_access_token";
export const THREADS_ME_URL = "https://graph.threads.net/v1.0/me";
export const THREADS_CALLBACK_URL = "https://sns-mnm-pro-prototype.pages.dev/api/threads/oauth/callback";
export const THREADS_TOKEN_DAYS = 60;
export const THREADS_RECONNECT_WARNING_DAYS = 14;
export const THREADS_RECONNECT_CRITICAL_DAYS = 7;

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export function redirect(url, status = 302) {
  return new Response(null, { status, headers: { location: url } });
}

export function baseUrlFromRequest(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function callbackUrl(request) {
  void request;
  return THREADS_CALLBACK_URL;
}

export function tokenDates(now = new Date(), expiresInSeconds = THREADS_TOKEN_DAYS * 24 * 60 * 60) {
  const issued = now;
  const expires = new Date(now.getTime() + Number(expiresInSeconds || THREADS_TOKEN_DAYS * 24 * 60 * 60) * 1000);
  return {
    issuedAt: issued.toISOString(),
    refreshAfterAt: new Date(issued.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    refreshDueAt: new Date(expires.getTime() - THREADS_RECONNECT_WARNING_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: expires.toISOString()
  };
}

export function daysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

export function connectionView(row = {}) {
  const remaining = daysRemaining(row.token_expires_at);
  const expired = remaining !== null && remaining <= 0;
  const reconnectCritical = remaining !== null && remaining <= THREADS_RECONNECT_CRITICAL_DAYS;
  const reconnectRecommended = remaining !== null && remaining <= THREADS_RECONNECT_WARNING_DAYS;
  return {
    connection_status: expired ? "expired" : (row.connection_status || "disconnected"),
    auth_type: row.auth_type || "oauth",
    threads_user_id: row.threads_user_id || "",
    threads_username: row.threads_username || "",
    access_token_last4: row.access_token_last4 || "",
    token_expires_at: row.token_expires_at || "",
    token_days_remaining: remaining,
    reconnect_warning_days: THREADS_RECONNECT_WARNING_DAYS,
    reconnect_critical_days: THREADS_RECONNECT_CRITICAL_DAYS,
    reconnect_recommended: reconnectRecommended,
    reconnect_critical: reconnectCritical,
    reconnect_level: expired ? "expired" : reconnectCritical ? "critical" : reconnectRecommended ? "warning" : "ok",
    last_tested_at: row.last_tested_at || "",
    last_synced_at: row.last_synced_at || "",
    oauth_connected_at: row.oauth_connected_at || ""
  };
}

export async function getThreadsAppSettings(env, { includeSecret = false } = {}) {
  if (!env.DB) throw new Error("DB binding missing");
  const rows = await env.DB.prepare(`
    SELECT key, value, encrypted_value, value_last4
    FROM service_settings
    WHERE key IN ('threads_app_id', 'threads_app_secret', 'threads_oauth_scopes')
  `).all();
  const map = Object.fromEntries((rows.results || []).map((row) => [row.key, row]));
  const appId = map.threads_app_id?.value || env.THREADS_APP_ID || "";
  const scopes = map.threads_oauth_scopes?.value || env.THREADS_OAUTH_SCOPES || THREADS_SCOPES.join(",");
  const secretLast4 = map.threads_app_secret?.value_last4 || (env.THREADS_APP_SECRET ? last4(env.THREADS_APP_SECRET) : "");
  let appSecret = "";
  if (includeSecret) {
    if (map.threads_app_secret?.encrypted_value) {
      appSecret = await decryptString(map.threads_app_secret.encrypted_value, env.THREADS_ENCRYPTION_KEY);
    } else {
      appSecret = env.THREADS_APP_SECRET || "";
    }
  }
  return {
    configured: Boolean(appId && (secretLast4 || appSecret)),
    appId,
    appSecret,
    secretLast4,
    scopes
  };
}

export async function saveThreadsAppSettings(env, adminUser, input) {
  if (!env.DB || !env.THREADS_ENCRYPTION_KEY) throw new Error("Threads settings bindings are not configured");
  const now = new Date().toISOString();
  const appId = String(input.meta_app_id || input.metaAppId || "").trim();
  const appSecret = String(input.meta_app_secret || input.metaAppSecret || "").trim();
  const scopes = String(input.scopes || input.scope || THREADS_SCOPES.join(",")).trim();
  if (!appId) return { ok: false, status: 400, error_code: "MISSING_META_APP_ID", message: "Meta App IDを入力してください" };

  await upsertSetting(env, "threads_app_id", appId, null, null, now, adminUser.userId);
  await upsertSetting(env, "threads_oauth_scopes", scopes || THREADS_SCOPES.join(","), null, null, now, adminUser.userId);
  let secretLast4 = null;
  if (appSecret) {
    const encrypted = await encryptString(appSecret, env.THREADS_ENCRYPTION_KEY);
    secretLast4 = last4(appSecret);
    await upsertSetting(env, "threads_app_secret", null, encrypted, secretLast4, now, adminUser.userId);
  }
  const saved = await getThreadsAppSettings(env, { includeSecret: false });

  return {
    ok: true,
    settings: {
      meta_app_id: appId,
      meta_app_secret_last4: secretLast4 || saved.secretLast4 || undefined,
      scopes: scopes || THREADS_SCOPES.join(",")
    }
  };
}

export async function upsertSetting(env, key, value, encryptedValue, valueLast4, now, adminUserId) {
  await env.DB.prepare(`
    INSERT INTO service_settings (key, value, encrypted_value, value_last4, created_at, updated_at, updated_by_admin_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = COALESCE(excluded.value, service_settings.value),
      encrypted_value = COALESCE(excluded.encrypted_value, service_settings.encrypted_value),
      value_last4 = COALESCE(excluded.value_last4, service_settings.value_last4),
      updated_at = excluded.updated_at,
      updated_by_admin_id = excluded.updated_by_admin_id
  `).bind(key, value, encryptedValue, valueLast4, now, now, adminUserId).run();
}

export async function exchangeCodeForShortToken({ code, redirectUri, appId, appSecret }) {
  const form = new FormData();
  form.set("client_id", appId);
  form.set("client_secret", appSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", redirectUri);
  form.set("code", code);
  const response = await fetch(THREADS_TOKEN_URL, { method: "POST", body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(safeMetaError(data, "THREADS_CODE_EXCHANGE_FAILED"));
  return data;
}

export async function exchangeForLongLivedToken({ shortToken, appSecret }) {
  const url = new URL(THREADS_LONG_LIVED_URL);
  url.searchParams.set("grant_type", "th_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortToken);
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(safeMetaError(data, "THREADS_LONG_TOKEN_FAILED"));
  return data;
}

export async function refreshLongLivedToken({ accessToken }) {
  const url = new URL(THREADS_REFRESH_URL);
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(safeMetaError(data, "THREADS_REFRESH_FAILED"));
  return data;
}

export async function fetchThreadsProfile({ accessToken }) {
  const url = new URL(THREADS_ME_URL);
  url.searchParams.set("fields", "id,username");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error(safeMetaError(data, "THREADS_PROFILE_FETCH_FAILED"));
  return {
    id: String(data.id || "").trim(),
    username: String(data.username || "").trim()
  };
}

export async function saveOAuthConnection(env, userId, tokenData) {
  const now = new Date();
  const dates = tokenDates(now, tokenData.expires_in);
  const accessToken = tokenData.access_token;
  const encryptedToken = await encryptString(accessToken, env.THREADS_ENCRYPTION_KEY);
  const threadsUserId = String(tokenData.user_id || tokenData.threads_user_id || "").trim();
  const threadsUsername = String(tokenData.username || tokenData.threads_username || "").trim();
  const existing = await env.DB.prepare("SELECT id FROM threads_connections WHERE user_id = ? LIMIT 1")
    .bind(userId)
    .first();

  if (existing) {
    await env.DB.prepare(`
      UPDATE threads_connections
      SET auth_type = 'oauth',
          threads_user_id = COALESCE(?, threads_user_id),
          threads_username = COALESCE(?, threads_username),
          access_token_encrypted = ?,
          access_token_last4 = ?,
          token_expires_at = ?,
          connection_status = 'connected',
          last_tested_at = ?,
          oauth_connected_at = COALESCE(oauth_connected_at, ?),
          token_issued_at = ?,
          token_refresh_after_at = ?,
          token_refresh_due_at = ?,
          token_last_refreshed_at = NULL,
          last_error_code = NULL,
          last_error_message = NULL,
          updated_at = ?
      WHERE user_id = ?
    `).bind(
      threadsUserId || null,
      threadsUsername || null,
      encryptedToken,
      last4(accessToken),
      dates.expiresAt,
      now.toISOString(),
      now.toISOString(),
      dates.issuedAt,
      dates.refreshAfterAt,
      dates.refreshDueAt,
      now.toISOString(),
      userId
    ).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO threads_connections (
        id, user_id, auth_type, threads_user_id, threads_username, access_token_encrypted, access_token_last4,
        token_expires_at, connection_status, last_tested_at, oauth_connected_at,
        token_issued_at, token_refresh_after_at, token_refresh_due_at, created_at, updated_at
      )
      VALUES (?, ?, 'oauth', ?, ?, ?, ?, ?, 'connected', ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      userId,
      threadsUserId || null,
      threadsUsername || null,
      encryptedToken,
      last4(accessToken),
      dates.expiresAt,
      now.toISOString(),
      now.toISOString(),
      dates.issuedAt,
      dates.refreshAfterAt,
      dates.refreshDueAt,
      now.toISOString(),
      now.toISOString()
    ).run();
  }

  return dates;
}

export function newOAuthState() {
  return randomToken(32);
}

export function safeMetaError(data, fallback) {
  const code = data?.error?.code || data?.error_type || fallback;
  const message = data?.error?.message || data?.error_message || fallback;
  return `${code}: ${message}`.slice(0, 220);
}
