import { clearSessionCookie, revokeCurrentSession, SESSION_SCOPE_USER } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  await revokeCurrentSession(env, request, SESSION_SCOPE_USER);
  return Response.json({ ok: true, redirect: "/login.html" }, {
    headers: { "Set-Cookie": clearSessionCookie(SESSION_SCOPE_USER) }
  });
}
