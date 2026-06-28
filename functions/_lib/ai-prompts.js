import { resolvePostTypeProfile } from "./ai-post-types.js";
import { resolveToneProfile } from "./ai-tone-profiles.js";
import { analyzeUserInput } from "./ai-input-understanding.js";

export const PHASE1_FEATURE_LABELS = {
  "ai-post": "AI投稿文生成",
  "day-generate": "1日分生成",
  "bulk-generate": "一括生成",
  thread: "投稿分割設計",
  series: "投稿シリーズ生成",
  rewrite: "ブラッシュアップ",
  cta: "会話導線設計",
  viral: "投稿前スコア診断",
  "ab-test": "投稿AB比較",
  score: "見込み客スコア",
  "buzz-pattern": "自然会話パターン分析",
  "buzz-research": "トーク自然発生テーマ"
};

export function normalizeGenerationInput(feature, input = {}, profile = {}, options = {}) {
  const tone = input.tone || profile.tone || "親しみやすい";
  const postType = input.type || input.post_type || input.purpose || profile.purpose || "共感型";
  const toneProfile = resolveToneProfile(tone);
  const postTypeProfile = resolvePostTypeProfile(postType, input.purpose || profile.purpose);
  const platform = normalizePlatform(input.channel || input.platform || profile.channels || "Threads");
  const count = normalizeCount(input.count, feature === "day-generate" ? 3 : (feature === "thread" ? 3 : 3));
  const theme = input.topic || input.theme || input.topics || input.source || input.post || "";
  const inputUnderstanding = options.inputUnderstanding || analyzeUserInput(feature, input, profile);

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

export function buildGenerationPrompt(feature, input, profile, extraInstruction = "", options = {}) {
  const context = normalizeGenerationInput(feature, input, profile, options);
  return [
    commonSystemPrompt(),
    "",
    featurePrompt(feature),
    "",
    tonePrompt(context),
    "",
    postTypePrompt(context),
    "",
    diversityPlanPrompt(feature, context),
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

// Named diversity assignment. Each candidate is given a specific framework,
// rhythm, and ending so variety comes from explicit assignment, not chance.
const DIVERSITY_FRAMEWORKS = [
  "問題提起 → 共感 → 視点転換 → 具体場面 → 自然な問い",
  "失敗談 → 気づき → 変えた行動 → 今の学び",
  "比較(伸びない型 / 伸びる型) → 理由 → 今日の改善",
  "あるある共感 → 原因の言語化 → 小さな一歩",
  "誤解 → 本質 → 実践ステップ → 軽い保存導線",
  "場面描写 → 迷い → 気づき → 小さな変化 → 読者への接続"
];
const DIVERSITY_RHYTHMS = [
  "短文中心・余白多め",
  "短文と中文を交互に混ぜる",
  "問いかけを途中に差し込む",
  "結論を先に出し、理由を後ろへ置く",
  "一文の密度を上げ、無駄な説明を削る"
];
const DIVERSITY_ENDINGS = [
  "読者が状況を話したくなる自然な問いで終える",
  "後で見返したくなる保存導線で終える",
  "必要な人だけプロフィール / 固定投稿へ軽く流して終える",
  "次にやる一歩を一つだけ置いて終える",
  "静かに言い切り、余白を残して終える"
];

function diversityCount(feature, context) {
  if (feature === "rewrite") return 0;
  if (feature === "cta") return 1;
  if (feature === "day-generate") return 3;
  return Math.max(1, Math.min(Number(context.post_count) || 1, 10));
}

function diversityCandidateLabel(feature, index) {
  if (feature === "day-generate") return ["朝投稿", "昼投稿", "夜投稿"][index] || `${index + 1}回目`;
  if (feature === "thread") return index === 0 ? "投稿1" : `リプ欄${index + 1}`;
  if (feature === "series") return `${index + 1}日目`;
  return `候補${index + 1}`;
}

function diversityPlanPrompt(feature, context) {
  const count = diversityCount(feature, context);
  if (count <= 0) return "";
  const lines = [];
  for (let i = 0; i < count; i++) {
    const label = diversityCandidateLabel(feature, i);
    const framework = DIVERSITY_FRAMEWORKS[i % DIVERSITY_FRAMEWORKS.length];
    const rhythm = DIVERSITY_RHYTHMS[(i * 2 + 1) % DIVERSITY_RHYTHMS.length];
    const ending = DIVERSITY_ENDINGS[(i * 3 + 2) % DIVERSITY_ENDINGS.length];
    lines.push(`- ${label}: framework=「${framework}」 / rhythm=「${rhythm}」 / ending=「${ending}」`);
  }
  return [
    "DIVERSITY PLAN (型の名指し割当):",
    "Use the assignment below as the skeleton for each item. Do not reuse the same framework, rhythm, or ending across items.",
    "Keep the body natural and faithful to input_understanding; the assignment guides structure, not wording.",
    ...lines
  ].join("\n");
}

// Diagnosis features (viral score / AB compare). These evaluate existing
// posts; they do not generate a feed of new posts.
export function buildDiagnosisPrompt(feature, input = {}, profile = {}) {
  const platform = normalizePlatform(input.channel || input.platform || profile.channels || "Threads");
  const shared = [
    "You are the SNS MNM-PRO post diagnosis engine for Threads/X operators.",
    "You evaluate how clearly a post communicates and how naturally it guides the reader.",
    "Score on a 0-100 scale where higher means easier to understand and more likely to earn a natural reaction.",
    "",
    "Hard rules:",
    "- Never promise or guarantee that a post will go viral, sell, or 必ず伸びる. This is a diagnosis, not a promise.",
    "- Judge クラリティ(伝わりやすさ), 冒頭の引き, 共感, 具体性, 読みやすさ, 導線の自然さ.",
    "- Penalize generic-advice endings, missing concrete anchors, flat sentence rhythm, and reply/keyword/DM/gift bait.",
    "- Improvement suggestions must be concrete and actionable, written in natural Japanese.",
    "- Any improved/recommended post you return must keep the original claim and not add unrelated CTA or bait.",
    "- Return valid JSON only. No markdown fences.",
    `- Target platform: ${platform}.`
  ];

  if (feature === "ab-test") {
    return [
      ...shared,
      "",
      "TASK: Compare post A and post B.",
      "Score each one, decide which communicates better, and explain why in concrete terms.",
      "If they are genuinely equal, winner is 引き分け.",
      "recommended_post must be the stronger post lightly improved (keep its meaning).",
      "",
      "CONTEXT:",
      JSON.stringify({
        platform,
        purpose: input.purpose || profile.purpose || "",
        target: input.target || profile.target || "",
        genre: profile.genre || ""
      }, null, 2),
      "",
      "POST A:",
      String(input.postA || ""),
      "",
      "POST B:",
      String(input.postB || "")
    ].join("\n");
  }

  if (feature === "score") {
    return [
      ...shared,
      "",
      "TASK: Estimate how warm a prospect is from their reply, and draft the next message.",
      "Read the reader's reply to our post and judge their interest temperature.",
      "lead_score is 0-100 (higher = warmer). temperature is 高い/中/低い.",
      "signals: concrete cues in their wording that justify the temperature.",
      "next_reply: a natural Japanese reply to send next. It must NOT push to buy; it should deepen the conversation or gently confirm their situation.",
      "push_caution (低い/中/高い): how much risk there is of coming across as pushy if we sell now.",
      "caution_note: one concrete note on how to avoid pushing too hard.",
      "Do not guarantee a sale. Do not invent facts not present in the reply.",
      "",
      "CONTEXT:",
      JSON.stringify({
        platform,
        product: input.product || profile.product || "",
        our_post: String(input.post || ""),
        offer: input.offer || ""
      }, null, 2),
      "",
      "READER REPLY:",
      String(input.reply || "")
    ].join("\n");
  }

  if (feature === "buzz-pattern") {
    return [
      ...shared,
      "",
      "TASK: Decompose the post and score how strongly it works as 保存型 / 共感型 / 案内型.",
      "scores.save / scores.empathy / scores.guide are each 0-100.",
      "dominant_type is the single strongest of 保存型 / 共感型 / 案内型.",
      "strengths/weaknesses: concrete, about this exact post.",
      "improvements: concrete, actionable rewrites of weak parts.",
      "rewrite_suggestion: one improved version of the post that keeps the original claim, no bait.",
      "",
      "CONTEXT:",
      JSON.stringify({
        platform,
        purpose: input.purpose || profile.purpose || "",
        target: input.target || profile.target || "",
        genre: profile.genre || ""
      }, null, 2),
      "",
      "POST:",
      String(input.post || "")
    ].join("\n");
  }

  if (feature === "buzz-research") {
    return [
      ...shared,
      "",
      "TASK: Propose talk-generating themes for the given topic. This is an AI proposal only.",
      "IMPORTANT: You have NO access to external SNS data or trends. Do not claim real data, view counts, or what is 'currently trending'.",
      "notice: a one-line Japanese disclaimer that these are AI proposals, not measured trend data.",
      "Propose 4-6 themes. For each: theme (short title), why (why a conversation naturally arises among the target), angle (the posting angle), example_opening (a natural first line for a post, no bait).",
      "Themes must be specific to the given topic/target/purpose, not generic SNS-operation advice.",
      "",
      "CONTEXT:",
      JSON.stringify({
        platform,
        topic: input.theme || input.topic || "",
        period: input.period || "",
        purpose: input.purpose || profile.purpose || "",
        target: input.target || profile.target || "",
        genre: profile.genre || ""
      }, null, 2)
    ].join("\n");
  }

  return [
    ...shared,
    "",
    "TASK: Diagnose a single post before it is published.",
    "Give an overall_score, sub scores, strengths, weaknesses, concrete improvements, and risk flags.",
    "improved_post must be a rewritten version that keeps the original claim but fixes the weaknesses.",
    "",
    "CONTEXT:",
    JSON.stringify({
      platform,
      purpose: input.purpose || profile.purpose || "",
      target: input.target || profile.target || "",
      genre: input.genre || profile.genre || ""
    }, null, 2),
    "",
    "POST:",
    String(input.post || "")
  ].join("\n");
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
    "- If the output drifts from the input meaning, treat it as low quality and fix it before returning.",
    "- input_understanding and all context fields are INTERNAL analysis. Never copy their wording (such as 整える, 流れを作る, 設計する, 余白を作る) into the body. The body must read only as the finished post a reader would see, never as a description of what you are doing."
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
      "Goal: rewrite the source post into one complete, ready-to-publish post whose final 1-2 lines weave in a natural question that makes the READER want to share their own experience.",
      "",
      "STEP 1 - Lock the reader and the topic before writing:",
      "- Read the source post and decide post_topic (what this post is about) and reader (the everyday person who would read it).",
      "- The reader is the post's audience (e.g. a person who struggles with night snacking), NOT the SNS operator.",
      "",
      "STEP 2 - Build the closing question:",
      "- The question MUST ask about the reader's own experience or situation regarding post_topic.",
      "- Example: a post about 夜の間食 must ask about the reader's own night eating or evening/daytime routine (e.g. 「あなたは夜、どんなときに手が伸びやすいですか？」).",
      "- conversation_goal (悩みを聞く / 商品案内につなげる / 保存してもらう etc.) and the talk-theme keyword only change the ANGLE of the question. They must NEVER change who the reader is.",
      "- FORBIDDEN even when conversation_goal is 商品案内: operator-perspective questions about the act of posting or selling, such as 「案内するとき売り込みっぽく見えて止まりますか？」. Ask the reader about their own situation first; never ask the operator about their marketing.",
      "- The question must be answerable only by readers of THIS specific post. A generic question that could be pasted onto any other post is a failure.",
      "",
      "STEP 3 - Write the body:",
      "- body is a single, completed post that reads as one natural Japanese text, not the source post with a question bolted on.",
      "- Preserve the source claim, metaphor, and temperature.",
      "- NEVER write process/meta sentences that describe what the tool is doing, such as 「〜余白を作ります」「〜の流れを作ります」「会話導線を設計します」「自然に話せるように整えます」「案内の前に…」. The body is the post itself, not a description of it.",
      "- Do not output reply scenario, first/second/decline reply, debug notes, profile context, model name, or API information.",
      "- Avoid comment bait, keyword-reply bait, DM bait, free-gift bait, and repeated CTA.",
      "",
      "Return one post in posts array. body must be the completed post (with the question inside it). Leave cta empty unless there is a genuinely separate short optional CTA; never duplicate the body's question into cta."
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
  const cta = [
    "GOOD cta example — source post about 夜の間食 (night snacking):",
    "夜の間食、ダメだと分かっててもやめられないですよね。",
    "",
    "あれ、意志が弱いからじゃなくて、夕方からの過ごし方で決まっていることが多いです。",
    "昼を軽くしすぎた日ほど、夜にガクッときます。",
    "",
    "あなたは夜、どんなときにいちばん手が伸びやすいですか？仕事終わり、寝る前、なんとなくの時間…どれが近いか教えてください。",
    "",
    "Why this is good: the closing question asks the READER about their own night eating. It only fits a night-snacking post.",
    "",
    "BAD cta pattern 1 (operator-perspective question):",
    "案内するとき、売り込みっぽく見えそうで止まることありますか？  <- asks the operator about marketing, not the reader about the topic. REJECT.",
    "",
    "BAD cta pattern 2 (meta/process sentence in body):",
    "案内の前に、言いにくさや迷いを話せる余白を作ります。  <- describes what the tool does instead of being the post. REJECT.",
    "",
    "BAD cta pattern 3 (generic question reusable on any post):",
    "今いちばん気になっていることはありますか？  <- not tied to this post's topic. REJECT."
  ].join("\n");
  if (feature === "cta") return cta;
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
