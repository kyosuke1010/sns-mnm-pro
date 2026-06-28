import { analyzeUserInput, pickPrimaryInputText } from "./ai-input-understanding.js";
import { callOpenAiResponses, parseJsonOutput } from "./openai.js";

const UNDERSTANDING_FIELDS = [
  "main_claim",
  "reader_problem",
  "target_reader",
  "desired_action",
  "key_concept",
  "metaphor_or_unique_expression",
  "emotional_tone",
  "sales_intensity",
  "best_generation_angle"
];

const understandingSchema = {
  name: "sns_mnm_input_understanding_v1",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      main_claim: { type: "string" },
      reader_problem: { type: "string" },
      target_reader: { type: "string" },
      desired_action: { type: "string" },
      key_concept: { type: "string" },
      metaphor_or_unique_expression: { type: "string" },
      emotional_tone: { type: "string" },
      sales_intensity: { type: "string" },
      risk_points: { type: "array", items: { type: "string" } },
      best_generation_angle: { type: "string" }
    },
    required: [...UNDERSTANDING_FIELDS, "risk_points"]
  }
};

// Single LLM pass to understand the user input. Falls back to the regex-based
// analyzeUserInput on any failure (no key, model error, parse error, empty).
export async function understandInput({ apiKey, model, feature, input = {}, profile = {} }) {
  const fallback = analyzeUserInput(feature, input, profile);
  if (!apiKey || !model?.model) {
    return { understanding: fallback, source: "regex" };
  }
  try {
    const prompt = buildUnderstandingPrompt(feature, input, profile);
    const response = await callOpenAiResponses({
      apiKey,
      model: model.model,
      reasoning: "low",
      verbosity: "low",
      input: prompt,
      schema: understandingSchema,
      maxOutputTokens: 1200
    });
    const parsed = parseJsonOutput(response.text);
    return { understanding: mergeUnderstanding(fallback, parsed), source: "llm" };
  } catch {
    return { understanding: fallback, source: "regex" };
  }
}

function buildUnderstandingPrompt(feature, input, profile) {
  const sourceText = pickPrimaryInputText(input);
  const payload = {
    feature,
    source_text: sourceText,
    theme: input.theme || input.topic || input.topics || "",
    keyword: input.keyword || input.keywords || profile.keyword || "",
    conversation_goal: input.conversationGoal || input.conversation_goal || "",
    target: input.target || profile.target || "",
    purpose: input.purpose || profile.purpose || "",
    genre: profile.genre || "",
    product: profile.product || "",
    sales_tone: profile.salesTone || input.sales_intensity || ""
  };
  const ctaNote = feature === "cta"
    ? [
        "",
        "IMPORTANT for this feature (conversation path design):",
        "- source_text is the actual post. Its subject IS the topic. Analyze that topic, not SNS-operation generalities.",
        "- keyword and conversation_goal only set the ANGLE of the closing question. They MUST NOT change the topic.",
        "- Example: if source_text is about 夜の間食 (night snacking), main_claim / reader_problem / key_concept must be about night snacking / eating habits — never about 投稿が続かない, ネタ切れ, or 商品案内 just because the keyword says 案内/継続.",
        "- best_generation_angle must require the closing question to ask the reader about their own experience of the post's topic."
      ].join("\n")
    : "";
  return [
    "You analyze a Japanese SNS operator's input before post generation.",
    "Read the input meaning first. Do not invent facts that are not implied by the input.",
    "Return JSON only, no markdown.",
    "",
    "Fields:",
    "- main_claim: the user's core message or what they want the post to say (in Japanese).",
    "- reader_problem: the real reader problem behind this input.",
    "- target_reader: who this is for.",
    "- desired_action: what the reader should naturally do after reading.",
    "- key_concept: the single idea the post should turn on.",
    "- metaphor_or_unique_expression: any metaphor/quote/unique phrasing in the input, or empty string.",
    "- emotional_tone: the emotional temperature of the input.",
    "- sales_intensity: 弱め / 中 / 強め based on how much selling the input implies.",
    "- risk_points: array of risks (reply-bait, gift-bait, external-link push, exaggeration). Empty array if none.",
    "- best_generation_angle: the single best angle to generate from, faithful to the input.",
    "",
    "When source_text is present, it is the primary subject; keyword/purpose/target only add nuance and must not override the topic.",
    "If source_text is empty, infer from theme/keyword/purpose/target instead.",
    "All text fields must be natural Japanese.",
    ctaNote,
    "",
    "INPUT:",
    JSON.stringify(payload, null, 2)
  ].filter(Boolean).join("\n");
}

function mergeUnderstanding(base, llm) {
  const merged = { ...base };
  for (const key of UNDERSTANDING_FIELDS) {
    const value = String(llm?.[key] || "").trim();
    if (value) merged[key] = value;
  }
  if (Array.isArray(llm?.risk_points)) {
    const risks = llm.risk_points.map((item) => String(item || "").trim()).filter(Boolean);
    if (risks.length) merged.risk_points = risks;
  }
  return merged;
}
