import { getThreadsAppSettings, callbackUrl, exchangeCodeForShortToken, exchangeForLongLivedToken, fetchThreadsProfile, redirect, saveOAuthConnection } from "../../../_lib/threads-oauth.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const error = url.searchParams.get("error") || "";
  const errorDescription = url.searchParams.get("error_description") || "";
  let returnTo = "/index.html?page=settings&threads_oauth=failed";

  try {
    if (error) {
      return redirect(`/index.html?page=settings&threads_oauth=denied&reason=${encodeURIComponent(errorDescription || error)}`);
    }
    if (!state || !code || !env.SESSION_KV) {
      return redirect(returnTo);
    }

    const stateKey = `threads_oauth_state:${state}`;
    const stateValue = await env.SESSION_KV.get(stateKey, "json");
    await env.SESSION_KV.delete(stateKey);
    if (!stateValue?.userId) return redirect(returnTo);
    returnTo = stateValue.returnTo || "/index.html?page=settings";

    const settings = await getThreadsAppSettings(env, { includeSecret: true });
    if (!settings.appId || !settings.appSecret) {
      return redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}threads_oauth=app_not_configured`);
    }

    const shortToken = await exchangeCodeForShortToken({
      code,
      redirectUri: callbackUrl(request),
      appId: settings.appId,
      appSecret: settings.appSecret
    });
    const longToken = await exchangeForLongLivedToken({
      shortToken: shortToken.access_token,
      appSecret: settings.appSecret
    });
    const profile = await fetchThreadsProfile({ accessToken: longToken.access_token });
    await saveOAuthConnection(env, stateValue.userId, {
      ...longToken,
      user_id: profile.id || longToken.user_id || shortToken.user_id,
      username: profile.username || ""
    });

    return redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}threads_oauth=connected`);
  } catch {
    return redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}threads_oauth=failed`);
  }
}
