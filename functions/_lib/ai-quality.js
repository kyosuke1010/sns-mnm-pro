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
  if (!checks.length) {
    return {
      passed: false,
      shouldRetry: true,
      reason: "self_check is missing",
      minimumTotal: 0
    };
  }

  const totals = checks.map((check) => Number(check.total || 0));
  const minimumTotal = Math.min(...totals);
  const weakField = checks.find((check) =>
    CRITICAL_FIELDS.some((field) => Number(check[field] || 0) < CRITICAL_MINIMUM)
  );
  const failed = checks.find((check) => check.passed === false);
  const shouldRetry = Boolean(failed || weakField || minimumTotal < QUALITY_THRESHOLD);
  const reason = failed?.reason
    || (weakField ? "critical quality field is below threshold" : "")
    || (minimumTotal < QUALITY_THRESHOLD ? "quality total is below threshold" : "passed");

  return {
    passed: !shouldRetry,
    shouldRetry,
    reason,
    minimumTotal
  };
}

export function retryInstruction(quality) {
  return [
    "",
    "REGENERATION REQUIRED:",
    `Previous output failed quality check: ${quality.reason}.`,
    "Regenerate once. Do not apologize.",
    "Make the hook less generic, add a concrete scene, strengthen emotional flow, vary the CTA, and ensure selected tone/post type are visibly reflected.",
    "Avoid repeating the same opening, same sentence rhythm, and generic advice.",
    "Re-read input_understanding. Preserve the user's main claim, metaphor, reader problem, and best_generation_angle. Do not drift into a generic template."
  ].join("\n");
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
