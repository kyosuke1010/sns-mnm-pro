import { requireAdminUser } from "./_lib/auth.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const isAdminLogin = path === "/admin/login" || path === "/admin/login/index.html";
  const isAdminLogout = path === "/admin/logout" || path === "/admin/logout/index.html";
  const isAdminPage = path === "/admin" || path === "/admin.html";
  const isAdminSubPage = path.startsWith("/admin/");
  const isAdminApi = path.startsWith("/api/admin/");
  const isBootstrap = path === "/api/admin/bootstrap";
  const isRecovery = path === "/api/admin/recover-password";

  if (isAdminLogin || isAdminLogout || (!isAdminPage && !isAdminSubPage && (!isAdminApi || isBootstrap || isRecovery))) {
    return context.next();
  }

  try {
    await requireAdminUser(context.env, context.request);
    return context.next();
  } catch {
    if (isAdminApi) {
      return Response.json({ ok: false, error: "管理者権限が必要です" }, { status: 403 });
    }
    return new Response(accessDeniedHtml(), {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
}

function accessDeniedHtml() {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>管理画面にはアクセスできません | SNS MNM-PRO</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#06111f;color:#f6fbff;font-family:Inter,"Noto Sans JP",sans-serif;padding:22px}
    main{width:min(460px,100%);border:1px solid rgba(78,121,153,.34);border-radius:14px;background:rgba(8,23,42,.94);padding:24px;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.38)}
    h1{font-size:22px;margin:0 0 10px;overflow-wrap:anywhere}
    p{color:#a9c9e8;line-height:1.7;overflow-wrap:anywhere;margin:0 0 16px}
    .actions{display:grid;gap:10px;justify-items:center}
    a{display:inline-grid;place-items:center;min-height:44px;padding:0 18px;border-radius:10px;background:linear-gradient(105deg,#20d4c7,#2e89e8);color:white;text-decoration:none;font-weight:900;overflow-wrap:anywhere;min-width:220px}
    .ghost{background:rgba(11,27,46,.78);border:1px solid rgba(78,121,153,.34)}
  </style>
</head>
<body>
  <main>
    <h1>管理画面にはアクセスできません</h1>
    <p>管理者セッションでログインしてください。購入者セッションでは管理画面を開けません。</p>
    <div class="actions">
      <a href="/admin/login">管理者ログインへ</a>
      <a class="ghost" href="/admin/logout/">管理者ログアウト</a>
    </div>
  </main>
</body>
</html>`;
}
