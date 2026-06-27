export async function onRequestPost({ request }) {
  const payload = await safeJson(request);
  if (!String(payload?.content || "").trim()) {
    return json({ ok: false, message: "投稿本文を入力してください。" }, 400);
  }
  return json({
    ok: true,
    mode: "dry-run",
    scheduled: {
      platform: "Threads",
      status: "scheduled",
      contentLength: String(payload.content).length,
      scheduledAt: payload.scheduledAt || null
    },
    message: "Threads自動投稿Dry Runに成功しました。実投稿はThreads API接続成功後に有効化します。"
  });
}

async function safeJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
