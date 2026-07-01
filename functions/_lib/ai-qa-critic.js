import { evaluateGenerationQuality, inspectGeneratedText } from "./ai-quality.js";

const PASS = "pass";
const WARN = "warn";
const FAIL = "fail";
const UNMEASURED = "unmeasured";

const CTA_ACTION_PATTERNS = [
  /コメント欄/u,
  /コメントして/u,
  /コメントで/u,
  /(?:と|って)返信/u,
  /返信してください/u,
  /リプください/u,
  /リプで/u,
  /DMください|DMして|DMで/u
];

const CTA_REWARD_PATTERNS = [
  /資料/u,
  /特典/u,
  /無料/u,
  /プレゼント/u,
  /配布/u,
  /受け取/u,
  /送ります/u,
  /キーワード/u,
  /合言葉/u,
  /「[^」]{1,12}」/u
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
    templateResult(quality, objective, text),
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

  const autoFixable = overallVerdict === FAIL;
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

function templateResult(quality, objective, text = "") {
  const dangerousCta = detectDangerousCta(text);
  const rawFlags = [...new Set([...(quality.objectiveFlags || []), ...(objective.flags || [])])];
  // 危険CTAは専用判定(dangerousCtaResult)で評価するため、
  // 実際の危険CTAが無い場合はテンプレ感側の bait 誤検知を抑制する。
  const effectiveFlags = dangerousCta.length ? rawFlags : rawFlags.filter((flag) => flag !== "bait");
  const effectiveHardFail = objective.hardFail && (objective.flags || []).some((flag) => flag !== "bait" || dangerousCta.length);
  const aggregateShouldRetry = quality.shouldRetry && !((quality.objectiveFlags || []).includes("bait") && !dangerousCta.length);
  const hasTemplateFlags = effectiveFlags.some((flag) =>
    ["generic_ending", "meta_explanation", "no_concrete_anchor", "flat_rhythm", "taigen_overuse"].includes(flag)
  );
  const verdict = aggregateShouldRetry || effectiveHardFail
    ? FAIL
    : hasTemplateFlags
      ? WARN
      : PASS;
  return {
    item: "テンプレ感",
    verdict,
    reason: effectiveFlags.length ? `検出: ${effectiveFlags.join(", ")}` : "既存品質集約では大きなテンプレ兆候なし",
    measuredBy: "evaluateGenerationQuality + inspectGeneratedText"
  };
}

function dangerousCtaResult(text) {
  const hits = detectDangerousCta(text);
  return {
    item: "危険CTA",
    verdict: hits.length ? FAIL : PASS,
    reason: hits.length
      ? `行動指示と見返りが近接しています: ${hits.join(", ")}`
      : "行動指示と見返りの近接共起はなし",
    measuredBy: "small_proximity_check"
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

function detectDangerousCta(text) {
  const body = String(text || "");
  const hits = [];
  const actionHits = findMatchPositions(body, CTA_ACTION_PATTERNS);
  const rewardHits = findMatchPositions(body, CTA_REWARD_PATTERNS);
  for (const action of actionHits) {
    for (const reward of rewardHits) {
      const distance = Math.abs(action.index - reward.index);
      const sameSentence = areInSameSentence(body, action.index, reward.index);
      if (distance <= 45 || sameSentence) {
        hits.push(`${action.text} + ${reward.text}`);
      }
    }
  }
  return [...new Set(hits)];
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

function findMatchPositions(text, patterns) {
  const hits = [];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0] && Number.isInteger(match.index)) {
      hits.push({ text: match[0], index: match.index });
    }
  }
  return hits;
}

function areInSameSentence(text, aIndex, bIndex) {
  const min = Math.min(aIndex, bIndex);
  const max = Math.max(aIndex, bIndex);
  const between = text.slice(min, max);
  return !/[。\n！？!?]/u.test(between);
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
