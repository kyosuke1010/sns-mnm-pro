import { evaluateGenerationQuality, inspectGeneratedText } from "./ai-quality.js";

const PASS = "pass";
const WARN = "warn";
const FAIL = "fail";
const UNMEASURED = "unmeasured";

const DANGEROUS_CTA_PATTERNS = [
  /コメント欄に/u,
  /(?:と|って)返信/u,
  /DMください|DMして|DMで/u,
  /欲しい人|欲しい方/u,
  /無料(?:特典|配布|プレゼント|資料)/u,
  /キーワード/u,
  /合言葉/u,
  /「はい」|はいで/u
];

const SALES_PRESSURE_PATTERNS = [
  /今すぐ/u,
  /限定/u,
  /先着/u,
  /絶対/u,
  /保証/u,
  /申し込/u,
  /購入/u,
  /登録/u
];

export function critiqueGeneration({
  feature = "ai-post",
  output = null,
  postText = "",
  expectedTone = "",
  expectedPostType = ""
} = {}) {
  const normalizedOutput = output || buildOutputFromText(postText);
  const quality = evaluateGenerationQuality(feature, normalizedOutput);
  const text = collectText(feature, normalizedOutput, postText);
  const objective = inspectGeneratedText(text);

  const results = [
    templateResult(quality, objective),
    dangerousCtaResult(text),
    salesPressureResult(text),
    unmeasuredResult("投稿タイプ一致", expectedPostType, "MVP-Bでは意味比較ロジック未接続。既存集約からは判定できないため未計測。"),
    unmeasuredResult("口調一致", expectedTone, "MVP-Bではトーン意味比較ロジック未接続。既存集約からは判定できないため未計測。")
  ];

  const measured = results.filter((item) => item.verdict !== UNMEASURED);
  const overallVerdict = measured.some((item) => item.verdict === FAIL)
    ? FAIL
    : measured.some((item) => item.verdict === WARN)
      ? WARN
      : PASS;

  const autoFixable = overallVerdict !== PASS;
  const fixSuggestion = buildFixSuggestion(results, quality);

  return {
    overallVerdict,
    autoFixable,
    fixSuggestion,
    measuredItems: measured.length,
    unmeasuredItems: results.length - measured.length,
    qualityAggregate: quality,
    results
  };
}

function buildOutputFromText(postText) {
  const body = String(postText || "").trim();
  const selfCheck = {
    hook_strength: body ? 3 : 0,
    specificity: body ? 3 : 0,
    emotional_connection: body ? 3 : 0,
    platform_fit: body ? 3 : 0,
    uniqueness: body ? 3 : 0,
    cta_naturalness: body ? 3 : 0,
    practicality: body ? 3 : 0,
    human_likeness: body ? 3 : 0,
    tone_accuracy: body ? 3 : 0,
    post_type_accuracy: body ? 3 : 0,
    total: body ? 30 : 0,
    passed: Boolean(body),
    reason: body ? "text-only fallback check" : "empty body"
  };
  return { posts: [{ body, self_check: selfCheck }] };
}

function collectText(feature, output, fallback = "") {
  if (feature === "rewrite") {
    return String(output?.rewritten_post || fallback || "").trim();
  }
  const bodies = (output?.posts || [])
    .map((post) => [post?.body, post?.cta].filter(Boolean).join("\n"))
    .filter(Boolean);
  return bodies.length ? bodies.join("\n\n") : String(fallback || "").trim();
}

function templateResult(quality, objective) {
  const flags = [...new Set([...(quality.objectiveFlags || []), ...(objective.flags || [])])];
  const hasTemplateFlags = flags.some((flag) =>
    ["generic_ending", "meta_explanation", "no_concrete_anchor", "flat_rhythm", "taigen_overuse"].includes(flag)
  );
  const verdict = quality.shouldRetry || objective.hardFail
    ? FAIL
    : hasTemplateFlags
      ? WARN
      : PASS;
  return {
    item: "テンプレ感",
    verdict,
    reason: flags.length ? `検出: ${flags.join(", ")}` : "既存品質集約では大きなテンプレ兆候なし",
    measuredBy: "evaluateGenerationQuality + inspectGeneratedText"
  };
}

function dangerousCtaResult(text) {
  const hits = findMatches(text, DANGEROUS_CTA_PATTERNS);
  return {
    item: "危険CTA",
    verdict: hits.length ? FAIL : PASS,
    reason: hits.length
      ? `返信稼ぎ・特典誘導に見える可能性: ${hits.join(", ")}`
      : "危険CTAの小規模検出では問題なし",
    measuredBy: "small_regex_check"
  };
}

function salesPressureResult(text) {
  const hits = findMatches(text, SALES_PRESSURE_PATTERNS);
  const verdict = hits.length >= 2 ? WARN : PASS;
  return {
    item: "売り込み感",
    verdict,
    reason: hits.length
      ? `強い販売語が含まれる可能性: ${hits.join(", ")}`
      : "小規模検出では販売圧は強くない",
    measuredBy: "small_regex_check"
  };
}

function unmeasuredResult(item, expectedValue, reason) {
  return {
    item,
    verdict: UNMEASURED,
    expected: String(expectedValue || ""),
    reason,
    measuredBy: "not_available_in_mvp_b"
  };
}

function findMatches(text, patterns) {
  const body = String(text || "");
  const hits = [];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match?.[0]) hits.push(match[0]);
  }
  return [...new Set(hits)];
}

function buildFixSuggestion(results, quality) {
  const failed = results.filter((item) => item.verdict === FAIL || item.verdict === WARN);
  if (!failed.length) return "このMVP範囲では自動修正不要。";
  const suggestions = failed.map((item) => {
    if (item.item === "危険CTA") return "キーワード返信・DM誘導・特典誘導を、悩み共有や状況共有の自然な問いに弱める。";
    if (item.item === "売り込み感") return "今すぐ・限定・保証などの販売圧を下げ、読者の悩みの言語化から入る。";
    if (item.item === "テンプレ感") return `既存品質集約の理由を反映して再生成する: ${quality.reason}`;
    return item.reason;
  });
  return suggestions.join(" ");
}
