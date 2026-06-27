import { getAppSessionUser } from "../../_lib/auth.js";
import { getOpenAiSettings, openAiErrorResponse, saveOpenAiSettings } from "../../_lib/openai.js";

export async function onRequestGet({ request, env }) {
  try {
    const user = await getAppSessionUser(env, request);
    const settings = await getOpenAiSettings(env, user.userId);
    return Response.json({
      ok: true,
      openai: {
        configured: settings.configured,
        key_last4: settings.keyLast4,
        model_mode: settings.modelMode
      }
    });
  } catch (error) {
    return openAiErrorResponse(error);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const user = await getAppSessionUser(env, request);
    const input = await readJson(request);
    const apiKey = String(input.api_key || input.apiKey || "").trim();
    const modelMode = input.model_mode || input.modelMode || input.model || "standard";
    const profile = input.profile && typeof input.profile === "object" ? input.profile : null;
    const saved = await saveOpenAiSettings(env, user.userId, apiKey, modelMode, profile);
    return Response.json({
      ok: true,
      openai: {
        configured: saved.configured,
        key_last4: saved.keyLast4,
        model_mode: saved.modelMode
      },
      message: "OpenAI APIキーを保存しました"
    });
  } catch (error) {
    return openAiErrorResponse(error);
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
