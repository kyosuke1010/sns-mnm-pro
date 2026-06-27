import { getAppSessionUser } from "../../_lib/auth.js";
import {
  callOpenAiResponses,
  getOpenAiSettings,
  modelConfig,
  OpenAiSafeError,
  openAiErrorResponse,
  parseJsonOutput
} from "../../_lib/openai.js";
import { buildGenerationPrompt, normalizeGenerationInput, PHASE1_FEATURE_LABELS } from "../../_lib/ai-prompts.js";
import { outputSchema } from "../../_lib/ai-schemas.js";
import { evaluateGenerationQuality, retryInstruction } from "../../_lib/ai-quality.js";

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) throw new OpenAiSafeError("DB_BINDING_MISSING", "D1 binding is not configured", 500);
    const user = await getAppSessionUser(env, request);
    const body = await readJson(request);
    const feature = String(body.feature || "").trim();
    if (!PHASE1_FEATURE_LABELS[feature]) {
      throw new OpenAiSafeError("AI_FEATURE_NOT_SUPPORTED", "このAI機能はまだ実送信に対応していません", 400);
    }

    const settings = await getOpenAiSettings(env, user.userId, { includeKey: true });
    if (!settings.configured || !settings.apiKey) {
      throw new OpenAiSafeError("OPENAI_API_KEY_NOT_CONFIGURED", "設定画面でOpenAI APIキーを登録してください", 400);
    }

    const input = body.input && typeof body.input === "object" ? body.input : {};
    const rawProfile = body.profile && typeof body.profile === "object" ? body.profile : {};
    const profile = sanitizeProfileForGeneration(rawProfile);
    const context = normalizeGenerationInput(feature, input, profile);
    const model = modelConfig(settings.modelMode, env);
    const schema = outputSchema(feature);
    const maxOutputTokens = outputTokenBudget(feature, input);
    const firstPrompt = buildGenerationPrompt(feature, input, profile);
    let { output, quality, attempts } = await runGeneration({
      apiKey: settings.apiKey,
      model,
      feature,
      prompt: firstPrompt,
      schema,
      maxOutputTokens
    });

    if (quality.shouldRetry) {
      const secondPrompt = buildGenerationPrompt(feature, input, profile, retryInstruction(quality));
      const retry = await runGeneration({
        apiKey: settings.apiKey,
        model,
        feature,
        prompt: secondPrompt,
        schema,
        maxOutputTokens
      });
      output = retry.output;
      quality = retry.quality;
      attempts += retry.attempts;
    }

    const now = new Date().toISOString();
    const historyId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO generation_history (id, user_id, feature_key, input_json, output_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(historyId, user.userId, feature, safeJson({ input, profile, normalized_context: context }), safeJson(output), now).run();

    const posts = normalizeGeneratedPosts(feature, input, profile, output, now);
    for (const post of posts) {
      await env.DB.prepare(`
        INSERT INTO generated_posts (id, user_id, type, created_at, topic, target, purpose, platform, content, cta, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
      `).bind(
        crypto.randomUUID(),
        user.userId,
        feature,
        now,
        post.topic,
        post.target,
        post.purpose,
        post.platform,
        post.content,
        post.cta
      ).run();
    }

    return Response.json({
      ok: true,
      feature,
      feature_label: PHASE1_FEATURE_LABELS[feature],
      history_id: historyId,
      saved_posts: posts.length,
      quality: {
        passed: quality.passed,
        minimum_total: quality.minimumTotal,
        attempts,
        reason: quality.reason
      },
      output
    });
  } catch (error) {
    return openAiErrorResponse(error);
  }
}

async function runGeneration({ apiKey, model, prompt, schema, maxOutputTokens, feature }) {
  const response = await callOpenAiResponses({
    apiKey,
    model: model.model,
    reasoning: model.reasoning,
    verbosity: model.verbosity,
    input: prompt,
    schema,
    maxOutputTokens
  });
  const output = parseJsonOutput(response.text);
  const quality = evaluateGenerationQuality(feature, output);
  return { output, quality, attempts: 1 };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new OpenAiSafeError("INVALID_JSON", "リクエストJSONを確認してください", 400);
  }
}

function normalizeGeneratedPosts(feature, input, profile, output, createdAt) {
  const platform = normalizePlatform(input.channel || profile.channels || "Threads");
  const target = input.target || profile.target || "";
  const purpose = input.purpose || profile.purpose || "";
  if (feature === "day-generate") {
    return (output.posts || []).map((post) => ({
      topic: input.theme || input.topic || post.slot || "1日分生成",
      target,
      purpose,
      platform,
      content: post.body,
      cta: post.cta || profile.cta || "",
      createdAt
    })).filter((post) => post.content);
  }
  if (feature === "rewrite") {
    return [{
      topic: "ブラッシュアップ",
      target,
      purpose: input.purpose || "ブラッシュアップ",
      platform,
      content: output.rewritten_post || "",
      cta: output.cta || profile.cta || "",
      createdAt
    }].filter((post) => post.content);
  }
  if (feature === "cta") {
    return (output.posts || []).slice(0, 1).map((post) => ({
      topic: input.theme || input.topic || input.post || "会話導線設計",
      target,
      purpose: input.conversationGoal || input.conversation_goal || purpose || "会話導線設計",
      platform,
      content: post.body,
      cta: post.cta || profile.cta || "",
      createdAt
    })).filter((post) => post.content);
  }
  if (feature === "thread" || feature === "series") {
    return (output.posts || []).map((post, index) => ({
      topic: input.theme || post.title || (feature === "thread" ? `投稿${index + 1}` : `${index + 1}日目`),
      target: post.target || target,
      purpose,
      platform,
      content: post.body,
      cta: post.cta || profile.cta || "",
      createdAt
    })).filter((post) => post.content);
  }
  return (output.posts || []).map((post) => ({
    topic: input.topic || post.title || "AI投稿文生成",
    target: post.target || target,
    purpose,
    platform,
    content: post.body,
    cta: post.cta || profile.cta || "",
    createdAt
  })).filter((post) => post.content);
}

function sanitizeProfileForGeneration(profile = {}) {
  return {
    genre: removeInstructionLikeProfileText(profile.genre),
    target: removeInstructionLikeProfileText(profile.target),
    product: removeInstructionLikeProfileText(profile.product),
    purpose: removeInstructionLikeProfileText(profile.purpose),
    tone: removeInstructionLikeProfileText(profile.tone),
    banned: removeInstructionLikeProfileText(profile.banned),
    salesTone: removeInstructionLikeProfileText(profile.salesTone),
    length: removeInstructionLikeProfileText(profile.length),
    emoji: removeInstructionLikeProfileText(profile.emoji),
    channels: profile.channels || "Threads"
  };
}

function removeInstructionLikeProfileText(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const instructionLike = /(入力してください|返信してください|と返信|コメントしてください|コメント欄|DMください|キーワード返信|特典返信|無料配布|欲しい人|スイカ|suika|watermelon)/i;
  return instructionLike.test(text) ? "" : text;
}

function normalizePlatform(value) {
  const text = String(value || "");
  if (text.includes("両方")) return "Threads / X";
  if (text.includes("X") && !text.includes("Threads")) return "X";
  return "Threads";
}

function safeJson(value) {
  return JSON.stringify(value || {});
}

function outputTokenBudget(feature, input) {
  if (feature === "day-generate") return 7200;
  if (feature === "thread") return 8200;
  if (feature === "series") return 7600;
  if (feature === "rewrite") return 4400;
  const count = parseInt(String(input.count || "3").replace(/[^0-9]/g, ""), 10);
  const safeCount = Number.isFinite(count) && count > 0 ? Math.min(count, 10) : 3;
  return Math.max(4400, Math.min(9000, 2600 + safeCount * 1400));
}
