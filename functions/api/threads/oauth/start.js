import { AuthError } from "../../../_lib/auth.js";
import { callbackUrl, getThreadsAppSettings, getThreadsSessionUser, json, newOAuthState, redirect, THREADS_AUTHORIZE_URL } from "../../../_lib/threads-oauth.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await getThreadsSessionUser(env, request);
    const settings = await getThreadsAppSettings(env, { includeSecret: false });
    if (!settings.appId) {
      return json({
        ok: false,
        error_code: "THREADS_APP_NOT_CONFIGURED",
        message: "管理画面でMeta App IDとThreads App Secretを設定してください"
      }, 400);
    }
    if (!env.SESSION_KV) {
      return json({ ok: false, error_code: "SESSION_KV_MISSING", message: "OAuth state保存用KVが未設定です" }, 500);
    }

    const state = newOAuthState();
    const returnTo = new URL(request.url).searchParams.get("return_to") || "/index.html?page=settings";
    await env.SESSION_KV.put(`threads_oauth_state:${state}`, JSON.stringify({
      userId: user.userId,
      returnTo,
      createdAt: new Date().toISOString()
    }), { expirationTtl: 600 });

    const authorize = new URL(env.THREADS_AUTHORIZE_URL || THREADS_AUTHORIZE_URL);
    authorize.searchParams.set("client_id", settings.appId);
    authorize.searchParams.set("redirect_uri", callbackUrl(request));
    authorize.searchParams.set("scope", settings.scopes);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("state", state);
    return redirect(authorize.toString());
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ ok: false, error_code: "LOGIN_REQUIRED", message: "ログイン後にThreads連携を行ってください" }, error.status || 401);
    }
    return json({ ok: false, error_code: "THREADS_OAUTH_START_FAILED", message: "Threads連携を開始できませんでした。ログイン状態と管理画面のMeta設定を確認してください" }, 500);
  }
}
