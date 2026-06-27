import { requireAdminUser } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const admin = await requireAdminUser(env, request);
  return Response.json({
    ok: true,
    admin: {
      email: admin.email,
      role: "admin",
      plan: "admin_full",
      planLabel: "管理者フルアクセス",
      allFeatures: true,
      trialLimited: false,
      canAccessAdmin: true
    }
  });
}
