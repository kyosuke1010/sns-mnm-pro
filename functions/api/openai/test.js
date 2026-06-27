import { getAppSessionUser } from "../../_lib/auth.js";
import { callOpenAiResponses, getOpenAiSettings, modelConfig, OpenAiSafeError, openAiErrorResponse } from "../../_lib/openai.js";

export async function onRequestPost({ request, env }) {
  try {
    const user = await getAppSessionUser(env, request);
    const settings = await getOpenAiSettings(env, user.userId, { includeKey: true });
    if (!settings.configured || !settings.apiKey) {
      throw new OpenAiSafeError("OPENAI_API_KEY_NOT_CONFIGURED", "設定画面でOpenAI APIキーを登録してください", 400);
    }

    const config = modelConfig(settings.modelMode, env);
    await callOpenAiResponses({
      apiKey: settings.apiKey,
      model: config.model,
      reasoning: config.reasoning,
      verbosity: config.verbosity,
      input: "Reply with exactly this JSON: {\"ok\":true}",
      schema: {
        name: "openai_connection_test",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { ok: { type: "boolean" } },
          required: ["ok"]
        }
      },
      maxOutputTokens: 64
    });

    return Response.json({
      ok: true,
      message: "OpenAI API接続に成功しました",
      model_mode: settings.modelMode,
      key_last4: settings.keyLast4
    });
  } catch (error) {
    if (error instanceof OpenAiSafeError || error?.status === 401 || error?.status === 403) return openAiErrorResponse(error);
    return Response.json({
      ok: false,
      error_code: "OPENAI_CONNECTION_TEST_FAILED",
      message: "OpenAI API接続に失敗しました。APIキーと利用状況を確認してください"
    }, { status: 500 });
  }
}
