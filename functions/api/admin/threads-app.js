import { requireAdminUser } from "../../_lib/auth.js";
import { callbackUrl, getThreadsAppSettings, json, saveThreadsAppSettings } from "../../_lib/threads-oauth.js";

export async function onRequestGet({ request, env }) {
  try {
    const admin = await requireAdminUser(env, request);
    void admin;
    const settings = await getThreadsAppSettings(env);
    return json({
      ok: true,
      settings: {
        configured: settings.configured,
        meta_app_id: settings.appId,
        meta_app_secret_last4: settings.secretLast4,
        scopes: settings.scopes,
        redirect_uri: callbackUrl(request)
      }
    });
  } catch {
    return json({ ok: false, error_code: "ADMIN_THREADS_APP_READ_FAILED", message: "Threads管理設定を取得できませんでした" }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const admin = await requireAdminUser(env, request);
    const input = await request.json().catch(() => ({}));
    const result = await saveThreadsAppSettings(env, admin, input);
    if (!result.ok) return json({ ok: false, error_code: result.error_code, message: result.message }, result.status || 400);
    return json({
      ok: true,
      message: "Threads連携用Metaアプリ設定を保存しました",
      settings: result.settings
    });
  } catch {
    return json({ ok: false, error_code: "ADMIN_THREADS_APP_SAVE_FAILED", message: "Threads管理設定を保存できませんでした" }, 500);
  }
}
