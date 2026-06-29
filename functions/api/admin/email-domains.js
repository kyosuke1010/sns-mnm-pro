// 管理者専用: 設定中の EMAIL_API_KEY が「どのドメインを見えているか」を返す。
// これで「キーのアカウント/チームに kouchalab.support があるか」を切り分けられる。
// このパス(/api/admin/*)は _middleware.js で管理者セッション必須。

import { requireAdminUser } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  await requireAdminUser(env, request);
  if (!env.EMAIL_API_KEY) {
    return Response.json({ ok: false, error: "EMAIL_API_KEY が未設定です。" }, { status: 400 });
  }

  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return Response.json({ ok: false, status: res.status, error: data?.message || "Resend API エラー", detail: data }, { status: 502 });
  }

  const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
  const domains = list.map((d) => ({ name: d.name, status: d.status, region: d.region }));
  return Response.json({ ok: true, email_from: env.EMAIL_FROM || null, domain_count: domains.length, domains });
}
