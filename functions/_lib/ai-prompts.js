import { resolvePostTypeProfile } from "./ai-post-types.js";
import { resolveToneProfile } from "./ai-tone-profiles.js";
import { analyzeUserInput } from "./ai-input-understanding.js";

export const PHASE1_FEATURE_LABELS = {
  "ai-post": "AI投稿文生成",
  "day-generate": "1日分生成",
  "bulk-generate": "一括生成",
  thread: "投稿分割設計",
  series: "投稿シリーズ生成",
  rewrite: "ブラッシュアップ"
};

export function normalizeGenerationInput(feature, input = {}, profile = {}) {
  const tone = input.tone || profile.tone || "親しみやすい";
  const postType = input.type || input.post_type || input.purpose || profile.purpose || "共感型";
  const toneProfile = resolveToneProfile(tone);
  const postTypeProfile = resolvePostTypeProfile(postType, input.purpose || profile.purpose);
  const platform = normalizePlatform(input.channel || input.platform || profile.channels || "Threads");
  const count = normalizeCount(input.count, feature === "day-generate" ? 3 : (feature === "thread" ? 3 : 3));
  const theme = input.topic || input.theme || input.topics || input.source || input.post || "";
  const inputUnderstanding = analyzeUserInput(feature, input, profile);

  return {
    feature,
    feature_label: PHASE1_FEATURE_LABELS[feature] || feature,
    theme,
    source_text: input.source || input.post || "",
    keywords: input.keywords || input.keyword || profile.keyword || "",
    target: input.target || profile.target || "",
    goal: input.purpose || profile.purpose || "",
    platform,
    tone,
    tone_profile: toneProfile,
    post_type: postType,
    post_type_profile: postTypeProfile,
    post_count: count,
    cta_strength: inferCtaStrength(profile.salesTone, input.purpose),
    conversation_goal: input.conversationGoal || input.conversation_goal || input.type || "",
    talk_theme: input.keyword || "",
    specificity_level: input.specificity_level || "high",
    emotional_depth: input.emotional_depth || "medium_high",
    sales_intensity: profile.salesTone || input.sales_intensity || "弱め",
    avoid_phrases: splitList(profile.banned || input.avoid_phrases || ""),
    desired_structure: desiredStructure(feature, platform, postTypeProfile),
    example_presence: "include concrete everyday scene unless platform is X and too short",
    taboo_topics: splitList(input.taboo_topics || ""),
    reading_temperature: input.reading_temperature || "まだ興味段階",
    audience_awareness_stage: input.audience_awareness_stage || "problem aware",
    uniqueness_requirement: "Each output must use a different hook, sentence rhythm, concrete scene, and CTA wording.",
    previous_outputs: Array.isArray(input.previous_outputs) ? input.previous_outputs.slice(0, 5) : [],
    input_understanding: inputUnderstanding,
    profile: {
      genre: profile.genre || "",
      product: profile.product || "",
      url: profile.url || "",
      reply_keyword: input.keyword || profile.keyword || "",
      closing_cta: input.cta || profile.cta || "",
      length: profile.length || "中",
      emoji: profile.emoji || "使わない"
    },
    raw_input: input
  };
}

export function buildGenerationPrompt(feature, input, profile, extraInstruction = "") {
  const context = normalizeGenerationInput(feature, input, profile);
  return [
    commonSystemPrompt(),
    "",
    featurePrompt(feature),
    "",
    tonePrompt(context),
    "",
    postTypePrompt(context),
    "",
    fewShotPrompt(feature, context.platform),
    "",
    "USER AND MENU CONTEXT:",
    JSON.stringify(context, null, 2),
    "",
    outputContract(feature),
    extraInstruction || ""
  ].filter(Boolean).join("\n");
}

function commonSystemPrompt() {
  return [
    "You are the SNS MNM-PRO generation engine for Threads/X operators.",
    "A safe but generic post is a failed output.",
    "Your job is to create posts that feel usable with only small edits.",
    "",
    "Core flow to reproduce naturally:",
    "1. Name the reader's real problem in their own words.",
    "2. Shift the viewpoint or deny the common wrong assumption.",
    "3. Add lived feeling, hesitation, failure, or a concrete scene.",
    "4. Present a simple solution or next step.",
    "5. Place a natural CTA without pushing too hard.",
    "",
    "Quality rules:",
    "- Do not end with generic advice such as 'it is important', 'you should be conscious', or 'it becomes easier to read'.",
    "- Avoid repeating the same hook, same sentence rhythm, same conclusion, and same CTA.",
    "- Include at least one reader emotion: anxiety, fatigue, hesitation, embarrassment, frustration, expectation, or lack of traction.",
    "- Include a concrete real-world scene when possible.",
    "- Threads must have conversational rhythm, whitespace, and a natural save/reply/profile path.",
    "- X must be short, sharp, and remove extra explanation.",
    "- CTA must depend on context. Do not reuse one default CTA every time.",
    "- Avoid explicit keyword-reply CTA such as 'comment X', 'reply with X', 'DM me', or 'free gift' unless absolutely necessary.",
    "- Prefer natural questions that invite the reader to share their situation, problem, or experience.",
    "- The natural question must change with theme, reader type, talk-theme keyword, and tone. Do not default to one universal question.",
    "- Use soft conversation entry patterns such as problem sharing, situation sharing, self-introduction, experience sharing, comparison questions, or gentle guidance.",
    "- Do not glue a polite prefix onto an unrelated question. The final question must read like one natural Japanese sentence.",
    "- Do not force replies. Create a light conversation entry instead.",
    "- Keyword reply, gift CTA, and DM CTA should be rare and lower priority than save/profile guidance.",
    "- If the request contains comment bait, keyword reply bait, gift bait, or DM bait, weaken it into a natural question instead of repeating it.",
    "- Tone selection must change opening, pressure, empathy, assertion, rhythm, and CTA.",
    "- Post type selection must change structure, not just labels.",
    "- Avoid exaggerated claims, guaranteed results, suspicious urgency, and banned phrases.",
    "- Return valid JSON only. No markdown fences.",
    "- User input meaning has highest priority. If source text exists, understand its claim, reader problem, purpose, temperature, metaphor, and context before applying tone or post type.",
    "- Do not replace a user's source post with an unrelated generic post. Preserve the claim, metaphor, and unique expression unless the user asks to remove them.",
    "- Do not add an unrelated reply scenario, sales path, or CTA that is not supported by the input.",
    "- Before returning, verify that the output matches input_understanding.main_claim and input_understanding.best_generation_angle.",
    "- If the output drifts from the input meaning, treat it as low quality and fix it before returning."
  ].join("\n");
}

function featurePrompt(feature) {
  const prompts = {
    "ai-post": [
      "FEATURE: Single post generation.",
      "Create complete post candidates that can stand alone.",
      "Each post must include a strong first two lines, reader problem, viewpoint shift, concrete scene or lived feeling, simple solution, and natural CTA.",
      "If count is more than one, each candidate must use a different structure pattern."
    ],
    "day-generate": [
      "FEATURE: One-day post set.",
      "Create exactly three posts: 朝投稿, 昼投稿, 夜投稿.",
      "Morning: problem naming and empathy.",
      "Noon: cause, realization, or small lesson.",
      "Night: solution, reply path, soft service/tool guidance when relevant.",
      "The three posts must move emotional temperature forward. Do not write the same post with different role names."
    ],
    "bulk-generate": [
      "FEATURE: Bulk post candidate generation.",
      "Create multiple complete post candidates from the provided topic list.",
      "Each candidate must be independently usable, not a shallow variation of the same sentence.",
      "If topics are listed line by line, distribute candidates across those topics.",
      "Use different hooks, emotional angles, concrete scenes, and CTA wording for each candidate.",
      "Return the candidates in posts array. Candidate labels are handled by the UI."
    ],
    thread: [
      "FEATURE: Safe split-post design for Threads.",
      "Create a connected multi-post split structure, not one long article and not aggressive rapid-fire posting.",
      "Return exactly the requested number of posts as posts array.",
      "Post 1 must hook the reader and name the problem.",
      "Post 2 and onward must feel like follow-up replies, each with its own role and new value.",
      "Default to 3 posts when no count is specified.",
      "Do not recommend short-interval rapid posting.",
      "Do not place the same CTA in every post.",
      "CTA should appear only in the final post unless there is a strong reason otherwise.",
      "Avoid external-link CTA inside the body. Prefer soft save, reply, or profile guidance.",
      "Change the opening, role, and sentence rhythm in each post so it does not look mechanical.",
      "Avoid repeating the same explanation with different labels.",
      "The final post should softly close with a natural CTA."
    ],
    series: [
      "FEATURE: Multi-day series generation.",
      "Create a day-by-day post set, not one long article.",
      "Return exactly the requested number of posts as posts array.",
      "Each day must have a distinct role such as problem, cause, example, mistake, solution, or action step.",
      "Emotional temperature should progress across the days.",
      "Do not reuse the same hook, same scene, or same CTA across days."
    ],
    cta: [
      "FEATURE: Conversation path design.",
      "Use the source post as the base and reshape it lightly so readers can naturally share their problem, situation, self-introduction, or experience.",
      "This is not just adding one final question. Understand the source claim, reader problem, talk-theme keyword, and conversation goal first.",
      "Preserve the source post meaning and temperature. Only adjust flow when it helps the conversation entry feel natural.",
      "The body must be a completed post. Put the natural question inside the body or as the final line.",
      "Do not output reply scenario, first reply, second reply, decline reply, debug notes, profile context, model name, or API information.",
      "Avoid explicit comment bait, keyword reply bait, DM bait, free gift bait, and repeated CTA.",
      "If the goal is self-introduction, ask for the reader's theme or genre. If product guidance, ask what they want to organize before buying or applying. If save guidance, make the saved point clear.",
      "Return one post in posts array. Its body must be the completed post only. Use cta only when there is a short optional CTA candidate."
    ],
    rewrite: [
      "FEATURE: Brush-up existing post.",
      "Improve the source post without destroying its meaning.",
      "Do not merely paraphrase. Improve hook, human feeling, concrete scene, emotional flow, CTA naturalness, and platform fit.",
      "Clearly explain what was improved."
    ]
  };
  return (prompts[feature] || prompts["ai-post"]).join("\n");
}

function tonePrompt(context) {
  const tone = context.tone_profile;
  return [
    "TONE PROFILE:",
    `Label: ${tone.label}`,
    `Opening: ${tone.opening}`,
    `Viewpoint shift / denial: ${tone.denial}`,
    `Empathy amount: ${tone.empathy}`,
    `Assertion strength: ${tone.assertion}`,
    `Rhythm: ${tone.rhythm}`,
    `CTA pressure: ${tone.cta}`,
    `Sales intensity: ${tone.sales}`,
    `Vocabulary tendency: ${tone.vocabulary.join(", ")}`,
    "Apply this tone to the actual writing, not only to the ending."
  ].join("\n");
}

function postTypePrompt(context) {
  const type = context.post_type_profile;
  return [
    "POST TYPE PROFILE:",
    `Label: ${type.label}`,
    `Structure: ${type.structure}`,
    `Must include: ${type.mustInclude.join(", ")}`,
    `Avoid: ${type.avoid.join(", ")}`,
    "The output must visibly match this post type."
  ].join("\n");
}

function fewShotPrompt(feature, platform) {
  const threads = [
    "GOOD Threads example pattern:",
    "投稿ネタが切れるのは、才能がないからじゃないです。",
    "",
    "毎回ゼロから考えているから止まります。",
    "僕もそこで何度も手が止まりました。",
    "",
    "先に「誰の、どの悩みを、どこへ進めるか」を決めるだけで、投稿はかなり楽になります。",
    "",
    "あとで見返せるように保存しておいてください。",
    "",
    "BAD Threads pattern:",
    "投稿はターゲットを決めることが大事です。読みやすくすると反応が増えます。意識しましょう。"
  ].join("\n");
  const x = [
    "GOOD X example pattern:",
    "投稿ネタが切れる原因は、才能じゃなくて毎回ゼロから考えていること。先に型を決めるだけで、手は止まりにくくなる。",
    "",
    "BAD X pattern:",
    "投稿ネタを作るためにはターゲット設定や投稿目的の整理が重要で、読みやすい文章を意識すると良いです。"
  ].join("\n");
  const thread = [
    "BAD series/thread pattern to avoid:",
    "1投稿目: テーマは大事です。",
    "2投稿目: 原因を整理すると読みやすいです。",
    "3投稿目: 解決策を伝えることが必要です。",
    "This is just role labels with similar bodies and must be rejected."
  ].join("\n");
  if (["day-generate", "thread", "series"].includes(feature)) return [threads, thread].join("\n\n");
  if (platform === "X") return x;
  return [threads, x].join("\n\n");
}

function outputContract(feature) {
  const shared = [
    "SELF CHECK REQUIREMENT:",
    "Score every output from 0 to 5 for hook_strength, specificity, emotional_connection, platform_fit, uniqueness, cta_naturalness, usefulness, human_likeness, tone_accuracy, post_type_accuracy.",
    "total is the sum, max 50.",
    "If any important score would be 2 or lower, improve before returning.",
    "quality_score must equal self_check.total."
  ].join("\n");

  if (feature === "rewrite") {
    return [
      shared,
      "Return the exact JSON shape requested by the schema.",
      "rewritten_post must be the final brush-up text. Keep the source meaning, but improve it enough to be post-ready."
    ].join("\n");
  }
  if (feature === "day-generate") {
    return [
      shared,
      "Return exactly 3 posts in order: 朝投稿, 昼投稿, 夜投稿.",
      "Each post needs a different emotional_role and transition."
    ].join("\n");
  }
  if (feature === "thread") {
    return [
      shared,
      "Return posts array only. Each post is one publishable split-post item.",
      "Set role and transition for each post.",
      "Make the first item worthy of a standalone post and the later items worthy of continuation without looking like spam.",
      "Only the final item should normally contain CTA. Earlier items should avoid repeated CTA.",
      "Avoid external-link guidance in body text."
    ].join("\n");
  }
  if (feature === "series") {
    return [
      shared,
      "Return posts array only. Each post is one day in the series.",
      "Set role and transition for each post.",
      "Make each day meaningful on its own while also creating continuity."
    ].join("\n");
  }
  return [
    shared,
    "Return posts array with the requested count.",
    "Each candidate must differ in hook, concrete_scene, CTA, and rhythm."
  ].join("\n");
}

function desiredStructure(feature, platform, postTypeProfile) {
  if (feature === "day-generate") return "朝: 悩み/共感 -> 昼: 原因/気づき -> 夜: 解決/自然導線";
  if (feature === "thread") return "投稿1: 悩み/問題提起 -> リプ欄2: 視点転換/具体例 -> リプ欄3: 解決策/自然導線。CTAは原則最後だけ。";
  if (feature === "series") return "1日目: 問題提起 -> 2日目: 原因/具体例 -> 3日目: 解決/自然導線";
  if (feature === "rewrite") return "元文の意図 -> フック強化 -> 具体化 -> CTA自然化";
  if (platform === "X") return "短いフック -> 視点転換 -> 一言学び or 軽い導線";
  return postTypeProfile.structure;
}

function normalizePlatform(value) {
  const text = String(value || "");
  if (text.includes("両方")) return "Threads / X 両方";
  if (text.includes("X") && !text.includes("Threads")) return "X";
  return "Threads";
}

function normalizeCount(value, fallback) {
  const parsed = parseInt(String(value || "").replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 10);
}

function inferCtaStrength(salesTone = "", purpose = "") {
  const text = `${salesTone} ${purpose}`;
  if (text.includes("強")) return "medium_high";
  if (text.includes("商品") || text.includes("誘導") || text.includes("アフィリエイト")) return "medium";
  return "soft";
}

function splitList(value) {
  return String(value || "")
    .split(/[、,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
