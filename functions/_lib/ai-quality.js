export const QUALITY_THRESHOLD = 30;
export const CRITICAL_MINIMUM = 3;

const CRITICAL_FIELDS = [
  "specificity",
  "platform_fit",
  "uniqueness",
  "tone_accuracy",
  "post_type_accuracy",
  "human_likeness",
  "cta_naturalness"
];

export function evaluateGenerationQuality(feature, output) {
  const checks = collectChecks(feature, output);
  const objective = inspectOutputObjectively(feature, output);

  if (!checks.length) {
    return {
      passed: false,
      shouldRetry: true,
      reason: "self_check is missing",
      minimumTotal: 0,
      objectiveFlags: objective.flags
    };
  }

  const totals = checks.map((check) => Number(check.total || 0));
  const minimumTotal = Math.min(...totals);
  const weakField = checks.find((check) =>
    CRITICAL_FIELDS.some((field) => Number(check[field] || 0) < CRITICAL_MINIMUM)
  );
  const failed = checks.find((check) => check.passed === false);
  const shouldRetry = Boolean(failed || weakField || minimumTotal < QUALITY_THRESHOLD || objective.hardFail);

  const reasons = [];
  if (failed?.reason) reasons.push(failed.reason);
  if (weakField) reasons.push("critical quality field is below threshold");
  if (minimumTotal < QUALITY_THRESHOLD) reasons.push("quality total is below threshold");
  if (objective.hardFail) reasons.push(`objective text check failed: ${objective.flags.join(", ")}`);
  const reason = reasons.length ? reasons.join("; ") : "passed";

  return {
    passed: !shouldRetry,
    shouldRetry,
    reason,
    minimumTotal,
    objectiveFlags: objective.flags
  };
}

export function retryInstruction(quality) {
  const objective = quality.objectiveFlags || [];
  const objectiveLines = [];
  if (objective.includes("generic_ending")) {
    objectiveLines.push("- The body ended with generic advice. End with a concrete next step or a natural question instead of a maxim.");
  }
  if (objective.includes("bait")) {
    objectiveLines.push("- The body contained comment/keyword-reply/DM/gift bait. Remove it and use a natural question instead.");
  }
  if (objective.includes("no_concrete_anchor")) {
    objectiveLines.push("- The body had no concrete anchor. Add a number, a real scene, a quoted phrase, or a specific moment.");
  }
  if (objective.includes("flat_rhythm")) {
    objectiveLines.push("- The sentence rhythm was flat. Mix short punchy lines with longer ones.");
  }
  return [
    "",
    "REGENERATION REQUIRED:",
    `Previous output failed quality check: ${quality.reason}.`,
    "Regenerate once. Do not apologize.",
    "Make the hook less generic, add a concrete scene, strengthen emotional flow, vary the CTA, and ensure selected tone/post type are visibly reflected.",
    "Avoid repeating the same opening, same sentence rhythm, and generic advice.",
    ...objectiveLines,
    "Re-read input_understanding. Preserve the user's main claim, metaphor, reader problem, and best_generation_angle. Do not drift into a generic template."
  ].join("\n");
}

// Objective, machine-checked inspection of the generated body text.
// This does not rely on the model's own self_check scores.
export function inspectGeneratedText(text = "") {
  const body = String(text || "").trim();
  if (!body) {
    return { flags: ["empty_body"], hardFail: true, concreteAnchor: false, rhythmVaried: false };
  }
  const flags = [];
  const sentences = body.split(/[。\n!?！？]/).map((item) => item.trim()).filter(Boolean);
  const tail = sentences.slice(-2).join(" ");

  // 1. 説明文締め: ends on a generic maxim / advice instead of a concrete step or question.
  const genericEnding = /(大事です|大切です|大切だと思います|重要です|意識しましょう|意識してみて|意識すると|心がけましょう|心がけて|気をつけましょう|気を付けましょう|頑張りましょう|やってみましょう|読みやすくなります|反応が増えます|伸びやすくなります)/;
  const genericEndingLoose = /(が大事|が大切|が重要|を意識|を心がけ)[ぁ-んァ-ン。\s]*$/;
  if (genericEnding.test(tail) || genericEndingLoose.test(tail)) flags.push("generic_ending");

  // 2. bait: comment / keyword-reply / DM / gift bait.
  const bait = /(コメント欄に|コメントください|と返信|と書いて|返信してください|リプください|リプして|DMください|DM下さい|DMで送|キーワード返信|合言葉|「[^」]{1,10}」と(コメント|返信|送)|無料プレゼント|無料配布|特典を受け取|特典をお渡し|欲しい人は|ほしい人は)/;
  if (bait.test(body)) flags.push("bait");

  // 3. 具体アンカー: at least one concrete element (number, quote, real scene, specific moment).
  const concreteAnchor = /[0-9０-９]/.test(body)
    || /[「『][^」』]{2,}[」』]/.test(body)
    || /(とき|場面|あの日|去年|先日|昨日|今朝|朝|昼|夜|電車|スマホ|画面|手が止ま|スプレッドシート|メモ帳|ノート|例えば|たとえば|具体的に)/.test(body);
  if (!concreteAnchor) flags.push("no_concrete_anchor");

  // 4. 文長リズム: sentence length variation. Flat = many similar-length sentences.
  let rhythmVaried = true;
  const lengths = sentences.map((item) => item.length);
  if (lengths.length >= 3) {
    const max = Math.max(...lengths);
    const min = Math.min(...lengths);
    rhythmVaried = (max - min) >= 8 && min <= 24;
    if (!rhythmVaried) flags.push("flat_rhythm");
  }

  const hardFail = flags.includes("bait")
    || flags.includes("generic_ending")
    || (flags.includes("no_concrete_anchor") && flags.includes("flat_rhythm"));
  return { flags, hardFail, concreteAnchor, rhythmVaried };
}

function collectBodies(feature, output) {
  if (!output || typeof output !== "object") return [];
  if (feature === "rewrite") return [output.rewritten_post].map((item) => String(item || "")).filter(Boolean);
  return (output.posts || []).map((post) => String(post?.body || "")).filter(Boolean);
}

function inspectOutputObjectively(feature, output) {
  const bodies = collectBodies(feature, output);
  if (!bodies.length) return { flags: [], hardFail: false };
  const inspections = bodies.map(inspectGeneratedText);
  const flags = [...new Set(inspections.flatMap((item) => item.flags))];
  const hardFail = inspections.some((item) => item.hardFail);
  return { flags, hardFail };
}

function collectChecks(feature, output) {
  if (!output || typeof output !== "object") return [];
  if (feature === "rewrite") return output.self_check ? [output.self_check] : [];
  const checks = [];
  for (const post of output.posts || []) {
    if (post?.self_check) checks.push(post.self_check);
  }
  if (output.overall_self_check) checks.push(output.overall_self_check);
  return checks;
}
