// 管理者専用: Resend のメール設定確認用。指定アドレスにテスト送信する。
// このパス(/api/admin/*)は _middleware.js で管理者セッション必須。

import { requireAdminUser } from "../../_lib/auth.js";
import { sendTransactionalEmail } from "../../_lib/billing.js";

export async function onRequestPost({ request, env }) {
  await requireAdminUser(env, request);

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const to = String(body.to || "").trim();
  if (!to) return Response.json({ ok: false, error: "送信先メールアドレスを入力してください。" }, { status: 400 });

  if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) {
    return Response.json(
      { ok: false, error: "EMAIL_API_KEY / EMAIL_FROM が未設定です。Cloudflareに登録して再デプロイ後にお試しください。" },
      { status: 400 }
    );
  }

  const result = await sendTransactionalEmail(env, {
    to,
    subject: "【SNS MNM-PRO】メール送信テスト",
    text: "これは SNS MNM-PRO からのテストメールです。\nこのメールが届いていれば、メール設定は成功しています。",
    html: "<div style=\"font-family:sans-serif;line-height:1.7\"><p>これは <strong>SNS MNM-PRO</strong> からのテストメールです。</p><p>このメールが届いていれば、メール設定は成功しています ✅</p></div>"
  });

  if (result.sent) {
    return Response.json({ ok: true, id: result.id || null, message: "送信しました。受信トレイ（迷惑メールフォルダも）を確認してください。" });
  }
  return Response.json(
    { ok: false, error: result.error || result.reason || "送信に失敗しました。送信元ドメインとAPIキーを確認してください。", detail: result },
    { status: 502 }
  );
}
