import { understandInput } from "./ai-input-understanding-llm.js";
import { callOpenAiResponses, parseJsonOutput } from "./openai.js";

const DEFAULT_POST_COUNT = 3;
const MAX_POST_COUNT = 10;

const requestSchema = {
  name: "sns_mnm_request_orchestration_v1",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: { type: "string" },
      postCount: { type: "integer", minimum: 1, maximum: 10 },
      product: { type: "string" },
      target: { type: "string" },
      tone: { type: "string" },
      postType: { type: "string" },
      channel: { type: "string" },
      featureKey: { type: "string" },
      nextLayer: { type: "string" },
      ambiguities: { type: "array", items: { type: "string" } }
    },
    required: [
      "intent",
      "postCount",
      "product",
      "target",
      "tone",
      "postType",
      "channel",
      "featureKey",
      "nextLayer",
      "ambiguities"
    ]
  }
};

export async function orchestrateRequest({
  userRequest = "",
  apiKey = "",
  model = null,
  profile = {},
  featureHint = ""
} = {}) {
  const requestText = String(userRequest || "").trim();
  const deterministic = buildDeterministicPlan(requestText, profile, featureHint);
  const llmPlan = await maybeInterpretWithOpenAi({ requestText, apiKey, model, profile, featureHint });
  const plan = normalizePlan({ ...deterministic, ...compactPlan(llmPlan) }, requestText, profile, featureHint);
  const input = buildUnderstandingInput(requestText, plan, profile);
  const { understanding, source } = await understandInput({
    apiKey,
    model,
    feature: plan.featureKey,
    input,
    profile
  });

  return {
    ...plan,
    inputUnderstanding: understanding,
    understandingSource: source,
    requestText
  };
}

export function buildDeterministicPlan(userRequest = "", profile = {}, featureHint = "") {
  const text = String(userRequest || "").trim();
  const postCount = extractPostCount(text);
  const product = extractAfterLabel(text, ["商品", "サービス", "商材", "プロダクト"]) || safeString(profile.product);
  const target = extractTarget(text) || safeString(profile.target);
  const tone = extractTone(text) || safeString(profile.tone) || safeString(profile.defaultTone);
  const postType = extractPostType(text) || safeString(profile.postType) || safeString(profile.defaultPostType);
  const channel = extractChannel(text);
  const featureKey = pickFeatureKey(text, featureHint, postCount);
  const ambiguities = [];

  if (!target) ambiguities.push("target_not_explicit");
  if (!product && /商品|サービス|商材|販売|案内/.test(text)) ambiguities.push("product_not_explicit");
  if (!tone) ambiguities.push("tone_not_explicit");
  if (!postType) ambiguities.push("post_type_not_explicit");

  return normalizePlan({
    intent: inferIntent(text, featureKey),
    postCount,
    product,
    target,
    tone,
    postType,
    channel,
    featureKey,
    nextLayer: "generation",
    ambiguities
  }, text, profile, featureHint);
}

function buildUnderstandingInput(requestText, plan, profile) {
  return {
    inputText: requestText,
    theme: requestText,
    topic: requestText,
    product: plan.product || profile.product || "",
    target: plan.target || profile.target || "",
    tone: plan.tone || profile.tone || "",
    post_type: plan.postType || "",
    purpose: plan.intent || "",
    count: plan.postCount,
    channel: plan.channel
  };
}

async function maybeInterpretWithOpenAi({ requestText, apiKey, model, profile, featureHint }) {
  if (!apiKey || !model?.model || !requestText) return null;
  try {
    const response = await callOpenAiResponses({
      apiKey,
      model: model.model,
      reasoning: "low",
      verbosity: "low",
      input: buildOrchestrationPrompt(requestText, profile, featureHint),
      schema: requestSchema,
      maxOutputTokens: 900
    });
    return parseJsonOutput(response.text);
  } catch {
    return null;
  }
}

function buildOrchestrationPrompt(requestText, profile, featureHint) {
  return [
    "You extract a thin orchestration plan from a Japanese SNS tool request.",
    "Do not generate posts. Only decide routing and missing fields.",
    "Return JSON only.",
    "",
    "Rules:",
    "- postCount is the requested number of posts. If unclear, use 3.",
    "- featureKey is one of ai-post, bulk-generate, day-generate, rewrite, cta, thread, series.",
    "- nextLayer should be generation unless the request is too ambiguous.",
    "- ambiguities must list missing information honestly.",
    "",
    `feature_hint: ${featureHint || ""}`,
    "profile:",
    JSON.stringify({
      product: profile?.product || "",
      target: profile?.target || "",
      tone: profile?.tone || profile?.defaultTone || "",
      postType: profile?.postType || profile?.defaultPostType || ""
    }, null, 2),
    "",
    "user_request:",
    requestText
  ].join("\n");
}

function normalizePlan(plan, requestText = "", profile = {}, featureHint = "") {
  const postCount = clampInt(plan?.postCount || extractPostCount(requestText), 1, MAX_POST_COUNT);
  const featureKey = plan?.featureKey || pickFeatureKey(requestText, featureHint, postCount);
  const ambiguities = uniqueArray(plan?.ambiguities || []);

  return {
    intent: safeString(plan?.intent) || inferIntent(requestText, featureKey),
    postCount,
    product: safeString(plan?.product) || safeString(profile.product),
    target: safeString(plan?.target) || safeString(profile.target) || inferDefaultTarget(requestText),
    tone: safeString(plan?.tone) || safeString(profile.tone) || safeString(profile.defaultTone) || "親しみやすい",
    postType: safeString(plan?.postType) || safeString(profile.postType) || safeString(profile.defaultPostType) || "共感型",
    channel: safeString(plan?.channel) || extractChannel(requestText),
    featureKey,
    nextLayer: safeString(plan?.nextLayer) || "generation",
    ambiguities
  };
}

function compactPlan(plan) {
  if (!plan || typeof plan !== "object") return null;
  return Object.fromEntries(
    Object.entries(plan).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "number") return Number.isFinite(value);
      return Boolean(String(value || "").trim());
    })
  );
}

function extractPostCount(text) {
  const value = String(text || "");
  const digit = value.match(/(\d{1,2})\s*(本|件|投稿|個|案)/);
  if (digit) return clampInt(Number(digit[1]), 1, MAX_POST_COUNT);
  const jp = [
    ["十", 10], ["九", 9], ["八", 8], ["七", 7], ["六", 6],
    ["五", 5], ["四", 4], ["三", 3], ["二", 2], ["一", 1]
  ].find(([char]) => new RegExp(`${char}\\s*(本|件|投稿|個|案)`).test(value));
  return jp ? jp[1] : DEFAULT_POST_COUNT;
}

function extractAfterLabel(text, labels) {
  const value = String(text || "");
  for (const label of labels) {
    const match = value.match(new RegExp(`${label}(?:名|は|:|：)?\\s*([^。\\n、,]+)`));
    if (match?.[1]) return cleanupField(match[1]);
  }
  return "";
}

function extractTarget(text) {
  const value = String(text || "");
  const explicit = extractAfterLabel(value, ["ターゲット", "対象", "誰向け"]);
  if (explicit) return explicit;
  if (/個人事業主|フリーランス/.test(value)) return "個人事業主";
  if (/副業/.test(value)) return "副業で発信している人";
  if (/講師|コンサル/.test(value)) return "講師・コンサル";
  if (/店舗|サロン|来店/.test(value)) return "店舗・サロン運営者";
  if (/EC|物販|通販/.test(value)) return "EC・物販運営者";
  return "";
}

function extractTone(text) {
  const value = String(text || "");
  const explicit = extractAfterLabel(value, ["口調", "トーン"]);
  if (explicit) return explicit;
  if (/やわらか|柔らか/.test(value)) return "やわらかい案内型";
  if (/寄り添/.test(value)) return "寄り添う形";
  if (/親しみ/.test(value)) return "親しみやすい";
  if (/論理/.test(value)) return "論理的";
  if (/熱量|強め/.test(value)) return "熱量高め";
  return "";
}

function extractPostType(text) {
  const value = String(text || "");
  const explicit = extractAfterLabel(value, ["投稿タイプ", "型"]);
  if (explicit) return explicit;
  if (/保存/.test(value)) return "保存型";
  if (/商品導線|販売導線|案内/.test(value)) return "商品導線型";
  if (/教育/.test(value)) return "教育型";
  if (/失敗談/.test(value)) return "失敗談型";
  if (/共感/.test(value)) return "共感型";
  return "";
}

function extractChannel(text) {
  const value = String(text || "");
  if (/Threads|スレッズ/i.test(value) && /X|Twitter/i.test(value)) return "Threads / X";
  if (/X|Twitter/i.test(value)) return "X";
  return "Threads";
}

function pickFeatureKey(text, featureHint, postCount) {
  const hinted = safeString(featureHint);
  if (hinted) return hinted;
  const value = String(text || "");
  if (/1日分|一日分|朝昼夜|朝・昼・夜/.test(value)) return "day-generate";
  if (/ブラッシュアップ|リライト|直して|整えて/.test(value)) return "rewrite";
  if (/会話導線|自然トーク|問い|質問/.test(value)) return "cta";
  if (/投稿分割|分割投稿|スレッド|リプ欄/.test(value)) return "thread";
  if (/シリーズ/.test(value)) return "series";
  if (postCount > 1) return "bulk-generate";
  return "ai-post";
}

function inferIntent(text, featureKey) {
  const value = String(text || "");
  if (featureKey === "rewrite") return "brush_up_existing_post";
  if (featureKey === "cta") return "add_safe_conversation_path";
  if (featureKey === "thread") return "split_post_safely";
  if (featureKey === "series") return "build_series_posts";
  if (/今週|週間/.test(value)) return "create_weekly_posts";
  return "generate_posts";
}

function inferDefaultTarget(text) {
  if (/Threads|スレッズ|投稿|発信/.test(String(text || ""))) return "SNS発信を続けたい人";
  return "読者";
}

function cleanupField(value) {
  return String(value || "")
    .replace(/(で|として|向け|に|を)?(作って|生成して|お願い|ください).*$/u, "")
    .replace(/[でにをへ]$/u, "")
    .trim();
}

function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return DEFAULT_POST_COUNT;
  return Math.min(max, Math.max(min, number));
}

function uniqueArray(values) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function safeString(value) {
  return String(value || "").trim();
}
