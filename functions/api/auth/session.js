import { getSessionUser, SESSION_SCOPE_USER } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await getSessionUser(env, request, SESSION_SCOPE_USER);
    const trial = trialState(user);
    if (trial.expired && user.trialStatus !== "expired" && env.DB) {
      await env.DB.prepare("UPDATE users SET trial_status = 'expired', updated_at = ? WHERE id = ? AND plan = 'trial'")
        .bind(new Date().toISOString(), user.userId)
        .run();
    }
    return Response.json({
      ok: true,
      user: {
        email: user.email,
        role: user.role,
        plan: user.role === "admin" ? "admin_full" : user.plan,
        allFeatures: user.role === "admin",
        canAccessAdmin: user.role === "admin",
        trialLimited: user.role !== "admin" && user.plan === "trial",
        trialStartedAt: user.trialStartedAt || null,
        trialExpiresAt: user.trialExpiresAt || null,
        trialStatus: trial.status,
        trialDaysRemaining: trial.daysRemaining,
        trialExpired: trial.expired
      }
    });
  } catch {
    return Response.json({ ok: false, error: "ログインが必要です" }, { status: 401 });
  }
}

function trialState(user) {
  if (user.role === "admin" || user.plan !== "trial") {
    return { status: user.trialStatus || null, daysRemaining: null, expired: false };
  }
  const expiresAt = user.trialExpiresAt ? new Date(user.trialExpiresAt).getTime() : 0;
  const diff = expiresAt - Date.now();
  const expired = !expiresAt || diff <= 0 || user.trialStatus === "expired";
  return {
    status: expired ? "expired" : (user.trialStatus || "active"),
    daysRemaining: expired ? 0 : Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000))),
    expired
  };
}
