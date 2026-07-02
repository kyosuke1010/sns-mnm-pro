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
  if (objective.includes("taigen_overuse")) {
    objectiveLines.push("- Too many sentences ended on a noun (体言止め), which reads as AI-written. Rewrite so almost every sentence ends with a verb, adjective, or feeling in natural spoken Japanese; keep 体言止め to at most one per post.");
  }
  if (objective.includes("meta_explanation")) {
    objectiveLines.push("- The body described what the tool does (e.g. 「〜余白を作ります」「会話導線を設計します」). The body must BE the post itself. Remove every process/meta sentence and write only what the reader would see.");
  }
  if (objective.includes("reframe_template")) {
    objectiveLines.push("- The body leaned on the AI cliché reframe 「Xじゃなくて、(実は)Yなんだよね」. Drop the neat pivot and just say the messy thing straight, with no balanced contrast.");
  }
  if (objective.includes("tidy_maxim")) {
    objectiveLines.push("- The body ended on a tidy quotable life-lesson (例:「結局〜なんだと思う」「大事なのは〜だけ」). End instead on an unresolved feeling, a half-joke, or a blunt specific question — do not wrap it up neatly.");
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

  // 2b. meta/process sentence: the tool describing what it does, instead of being the post.
  const metaExplanation = /(余白を作りま|余白を残しま|流れを作りま|流れに整え|導線を(設計|作り|整え)|会話導線を|自然に話せるように(しま|整え)|話せる(余白|流れ)を|案内の前に[、,])/;
  if (metaExplanation.test(body)) flags.push("meta_explanation");

  // 3. 具体アンカー: a number, a quote, a real scene, a specific moment, or a real product name.
  const concreteAnchor = /[0-9０-９]/.test(body)
    || /[「『][^」』]{2,}[」』]/.test(body)
    || /(ChatGPT|チャッピー|Claude|クロード|Gemini|ジェミニ|Perplexity|NotebookLM|Copilot|Midjourney|Canva|Notion|Excel|スプレッドシート|note)/i.test(body)
    || /(とき|場面|あの日|去年|先日|昨日|今朝|朝|昼|夜|電車|スマホ|画面|手が止ま|メモ帳|ノート|例えば|たとえば|具体的に)/.test(body);
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

  // 5. 体言止め overuse: too many PROSE sentences ending on a noun (a strong AI-smell tell).
  // Japanese predicates end in hiragana (る/た/い/です/ます/だ…); a prose sentence ending
  // in a kanji or katakana is almost always 体言止め. List items are excluded.
  const proseSentences = sentences.filter((item) => !/^[\s　]*(?:[①-⑳]|[0-9０-９]+[.)、．]|[-・*→▶◆●])/u.test(item));
  const taigenEndings = proseSentences.filter((item) => {
    const trimmed = item.replace(/[」』）)\]】、,…・\s　]+$/u, "");
    return /[一-龯ァ-ヶー]$/u.test(trimmed);
  });
  if (proseSentences.length >= 4 && taigenEndings.length >= 3 && (taigenEndings.length / proseSentences.length) >= 0.5) {
    flags.push("taigen_overuse");
  }

  // 6. reframe テンプレ: the「Xじゃなくて、(実は)Yなんだよね」contrastive-reframe — the single most
  //    common AI 共感-post tell. Precise: require the negation pivot AND a reflective softener
  //    ending nearby, so plain「コーヒーじゃなくて紅茶」does not trip it.
  const reframeTemplate = /(んじゃなくて|のではなく|ではなくて|じゃなくて)[、,]?\s*(?:たぶん|きっと|本当は|ほんとは|実は|むしろ)?[^。\n]{0,30}(なんだよね|んだと思う|なんだと思う|なのかも|だけ(?:なんだ|なの)|気がする)/;
  if (reframeTemplate.test(body)) flags.push("reframe_template");

  // 7. お利口な教訓オチ: tidy quotable life-lesson / maxim ending. Checked only on the tail.
  const tidyMaxim = /(結局[^。\n]{0,20}(進む|うまくいく|早い|変わる|だと思う|なんだと思う)|大事なのは[^。\n]{0,15}だけ|大切なのは[^。\n]{0,15}だけ|ほうが結局|だけなんだと思う|なんだと思います)/;
  if (tidyMaxim.test(tail)) flags.push("tidy_maxim");

  const hardFail = flags.includes("bait")
    || flags.includes("generic_ending")
    || flags.includes("meta_explanation")
    || flags.includes("taigen_overuse")
    || flags.includes("reframe_template")
    || flags.includes("tidy_maxim")
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
