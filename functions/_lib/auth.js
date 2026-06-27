import { hashSessionToken, randomToken, sha256Hex } from "./security.js";

export const ADMIN_SESSION_COOKIE_NAME = "sns_mnm_admin_session";
export const USER_SESSION_COOKIE_NAME = "sns_mnm_user_session";
export const SESSION_SCOPE_ADMIN = "admin";
export const SESSION_SCOPE_USER = "user";

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function cookieNameForScope(scope = SESSION_SCOPE_USER) {
  return scope === SESSION_SCOPE_ADMIN ? ADMIN_SESSION_COOKIE_NAME : USER_SESSION_COOKIE_NAME;
}

function cacheKeyForScope(scope, tokenHash) {
  return `session:${scope}:${tokenHash}`;
}

export function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = cookieHeader.split(";").map((part) => part.trim()).filter(Boolean);
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return "";
}

export function sessionCookie(scope, token, maxAgeSeconds) {
  return `${cookieNameForScope(scope)}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(scope = SESSION_SCOPE_USER) {
  return `${cookieNameForScope(scope)}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function getSessionUser(env, request, scope = SESSION_SCOPE_USER) {
  if (!env.DB) throw new AuthError(500, "D1 binding is not configured");
  const token = getCookie(request, cookieNameForScope(scope));
  if (!token) throw new AuthError(401, "Login required");

  const tokenHash = await hashSessionToken(token, env.APP_SECRET || "");
  const kvUser = await readSessionCache(env, scope, tokenHash);
  if (kvUser) {
    assertSessionScope(kvUser, scope);
    return kvUser;
  }

  const row = await env.DB.prepare(`
    SELECT
      sessions.id AS session_id,
      sessions.expires_at,
      sessions.revoked_at,
      users.id AS user_id,
      users.email,
      users.role,
      users.plan,
      users.status,
      users.trial_started_at,
      users.trial_expires_at,
      users.trial_status
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.session_token_hash = ?
      AND sessions.revoked_at IS NULL
      AND sessions.expires_at > ?
      AND users.status = 'active'
    LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).first();

  if (!row) throw new AuthError(401, "Invalid session");

  const user = {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    plan: row.plan,
    trialStartedAt: row.trial_started_at,
    trialExpiresAt: row.trial_expires_at,
    trialStatus: row.trial_status,
    expiresAt: row.expires_at
  };

  assertSessionScope(user, scope);
  await writeSessionCache(env, scope, tokenHash, user);
  return user;
}

export async function requireAdminUser(env, request) {
  const user = await getSessionUser(env, request, SESSION_SCOPE_ADMIN);
  if (user.role !== "admin") throw new AuthError(403, "Admin access required");
  return user;
}

export async function getAppSessionUser(env, request) {
  const adminView = request.headers.get("X-SNS-MNM-Admin-View") === "1";
  return getSessionUser(env, request, adminView ? SESSION_SCOPE_ADMIN : SESSION_SCOPE_USER);
}

export async function createSession(env, request, user, scope = SESSION_SCOPE_USER) {
  if (!env.DB) throw new AuthError(500, "D1 binding is not configured");
  if (!env.APP_SECRET) throw new AuthError(500, "APP_SECRET is not configured");
  const now = new Date();
  const maxAgeSeconds = user.role === "admin" ? 60 * 60 * 8 : 60 * 60 * 24 * 14;
  const expiresAt = new Date(now.getTime() + maxAgeSeconds * 1000).toISOString();
  const token = randomToken(48);
  const tokenHash = await hashSessionToken(token, env.APP_SECRET);
  const sessionId = crypto.randomUUID();
  const userAgentHash = request.headers.get("User-Agent")
    ? await sha256Hex(request.headers.get("User-Agent"), env.APP_SECRET)
    : null;
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
  const ipHash = ip ? await sha256Hex(ip, env.APP_SECRET) : null;

  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, session_token_hash, expires_at, created_at, updated_at, user_agent_hash, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(sessionId, user.userId || user.id, tokenHash, expiresAt, now.toISOString(), now.toISOString(), userAgentHash, ipHash).run();

  const sessionUser = {
    sessionId,
    userId: user.userId || user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
    trialStartedAt: user.trialStartedAt || user.trial_started_at || null,
    trialExpiresAt: user.trialExpiresAt || user.trial_expires_at || null,
    trialStatus: user.trialStatus || user.trial_status || null,
    expiresAt
  };
  assertSessionScope(sessionUser, scope);
  await writeSessionCache(env, scope, tokenHash, sessionUser);

  return {
    token,
    cookie: sessionCookie(scope, token, maxAgeSeconds),
    user: sessionUser
  };
}

export async function revokeCurrentSession(env, request, scope = SESSION_SCOPE_USER) {
  if (!env.DB || !env.APP_SECRET) return;
  const token = getCookie(request, cookieNameForScope(scope));
  if (!token) return;
  const tokenHash = await hashSessionToken(token, env.APP_SECRET);
  await env.DB.prepare("UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE session_token_hash = ?")
    .bind(new Date().toISOString(), new Date().toISOString(), tokenHash)
    .run();
  if (env.SESSION_KV) await env.SESSION_KV.delete(cacheKeyForScope(scope, tokenHash));
}

export function authErrorResponse(error) {
  const status = error instanceof AuthError ? error.status : 500;
  const message = error instanceof AuthError ? error.message : "Authentication error";
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function assertSessionScope(user, scope) {
  if (scope === SESSION_SCOPE_ADMIN && user.role !== "admin") {
    throw new AuthError(403, "Admin access required");
  }
  if (scope === SESSION_SCOPE_USER && user.role === "admin") {
    throw new AuthError(401, "User login required");
  }
}

async function readSessionCache(env, scope, tokenHash) {
  if (!env.SESSION_KV) return null;
  const value = await env.SESSION_KV.get(cacheKeyForScope(scope, tokenHash), "json");
  if (!value || !value.expiresAt || value.expiresAt <= new Date().toISOString()) return null;
  return value;
}

async function writeSessionCache(env, scope, tokenHash, user) {
  if (!env.SESSION_KV || !user.expiresAt) return;
  const ttl = Math.max(1, Math.floor((new Date(user.expiresAt).getTime() - Date.now()) / 1000));
  await env.SESSION_KV.put(cacheKeyForScope(scope, tokenHash), JSON.stringify(user), { expirationTtl: ttl });
}
