import { clearSessionCookie, revokeCurrentSession, SESSION_SCOPE_ADMIN } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  await revokeCurrentSession(env, request, SESSION_SCOPE_ADMIN);
  return Response.json({ ok: true, redirect: "/admin/login/" }, {
    headers: { "Set-Cookie": clearSessionCookie(SESSION_SCOPE_ADMIN) }
  });
}
