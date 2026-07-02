// ボイスプロファイル → 生成プロンプトへ挿入する文字列を組み立てる（Voice v1）。
//
// - 人格層(persona) は dialect に関係なく常に含める。
// - 口調層(register) は dialect で切替（#14 の値「関西弁/標準語」をそのまま受けて写像）。
// - 温度層(temperature) は postType から該当モードを選ぶ。
// - 指紋(fingerprints) は毎回2〜3個だけ散らす（乱数は引数注入でテスト可能）。
// - few-shot は温度モードに合致するものを最大2本添付。
// - forbidden は「避けるべき表現」として明示。
//
// 出力は既存プロンプトの後ろに連結できる自己完結の文字列。profile が無ければ "" を返す。

// #14 の dialect 値（日本語）を仕様書の register キー（kansai/standard）へ写像。
export function normalizeDialectKey(dialect) {
  return /関西|大阪|kansai/i.test(String(dialect || "")) ? "kansai" : "standard";
}

// 投稿タイプ文字列（共感型 / ノウハウ 等）から温度モードを選ぶ。
// temperature[mode].for のどれかが postType と部分一致すれば採用。既定は "standard"。
export function resolveTemperatureMode(temperature = {}, postType = "") {
  const pt = String(postType || "");
  if (pt) {
    for (const [mode, def] of Object.entries(temperature)) {
      const list = Array.isArray(def?.for) ? def.for : [];
      if (list.some((word) => word && (pt.includes(word) || word.includes(pt)))) return mode;
    }
  }
  return temperature.standard ? "standard" : Object.keys(temperature)[0] || "standard";
}

// 指紋を2〜3個だけ選ぶ。random は () => [0,1) を返す関数（既定 Math.random）。
export function pickFingerprints(fingerprints = [], random = Math.random) {
  const pool = Array.isArray(fingerprints) ? [...fingerprints] : [];
  if (pool.length <= 3) return pool;
  const count = 2 + Math.floor(random() * 2); // 2 or 3
  const chosen = [];
  while (chosen.length < count && pool.length) {
    const idx = Math.floor(random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen;
}

export function buildVoiceInstruction(profile, { dialect = "kansai", postType = "standard", random = Math.random } = {}) {
  if (!profile || typeof profile !== "object") return "";

  const dialectKey = normalizeDialectKey(dialect);
  const register = profile.register?.[dialectKey] || profile.register?.standard || {};
  const mode = resolveTemperatureMode(profile.temperature || {}, postType);
  const temp = profile.temperature?.[mode] || {};
  const fingerprints = pickFingerprints(profile.fingerprints || [], random);
  // v1 の few-shot 実例は関西弁で書かれているため、標準語モードでは添付しない
  // （関西弁表現の漏れ込みを防ぐ）。標準語は persona＋register＋温度＋指紋で担保。
  const examples = dialectKey === "kansai" ? (profile.examples?.[mode] || []).slice(0, 2) : [];

  const lines = [];
  lines.push("");
  lines.push(`VOICE PROFILE — write as this specific person (${profile.displayName || profile.id}), a continuation of their real voice, NOT an average of everyone. Reproduce the VOICE (rhythm, humor, register), not the exact facts of the examples.`);

  // 第1層：人格層（常に）
  lines.push("");
  lines.push("PERSONA (always on — this is the core; keep it even in 標準語):");
  for (const v of profile.persona?.coreValues || []) lines.push(`- 価値観: ${v}`);
  for (const e of profile.persona?.emotionPatterns || []) lines.push(`- 感情処理: ${e}`);
  if (profile.persona?.stance) lines.push(`- スタンス: ${profile.persona.stance}`);
  if (profile.persona?.analogyPool?.length) {
    lines.push(`- 抽象的な話は必ず身近な例えに変換する。引き出し: ${profile.persona.analogyPool.join(" / ")}`);
  }

  // 第2層：口調層（dialect 切替）
  lines.push("");
  lines.push(`REGISTER (dialect=${dialectKey}):`);
  if (register.agreement?.length) lines.push(`- 同意求め: ${register.agreement.join(" / ")}`);
  if (register.confidence?.length) lines.push(`- 自信の余白: ${register.confidence.join(" / ")}`);
  if (register.tsukkomi?.length) lines.push(`- ツッコミ: ${register.tsukkomi.join(" / ")}`);
  if (register.negation?.length) lines.push(`- 否定・不足: ${register.negation.join(" / ")}`);
  if (dialectKey === "standard") {
    lines.push("- 標準語でも丁寧語化しない。剥がすのは方言だけで、短文・自虐・例え話・ツッコミ・照れ隠し・脱線締めは残す。");
  }

  // 第3層：温度層（postType 連動）
  lines.push("");
  lines.push(`TEMPERATURE (mode=${mode} — 毎回同じテンションにしない):`);
  if (temp.emoji) lines.push(`- 記号・絵文字: ${temp.emoji}`);
  if (temp.style) lines.push(`- 特徴: ${temp.style}`);
  lines.push("- 重ね打ち(‼️‼️/😂😂😂)は感情のピークにのみ。弱音は必ずオチとセットにする。");

  // 指紋（2〜3個だけ）
  if (fingerprints.length) {
    lines.push("");
    lines.push("FINGERPRINTS — 今回はこの指紋だけ使う（全部入れ禁止。使い回し感を避けるため毎回変える）:");
    for (const f of fingerprints) lines.push(`- ${f}`);
  }

  // GUARDRAIL: このボイスは締め方の"スタイル"を変えるだけで、リーチ導線の"有無"は変えない。
  // 脱線締め/ノリツッコミ締め等を選んだ回でも、指示のどこかで save/reply/follow への
  // 自然な導線（具体的な締めの質問、または軽い共感の呼びかけ）を必ず残すこと。
  // これが無いと「本人っぽいが誰にも刺さらない投稿」になり、フォロー導線が死ぬ。
  lines.push("");
  lines.push("VOICE DOES NOT REPLACE REACH — critical:");
  lines.push("- Everything above (persona/register/temperature/fingerprints) changes HOW this person talks. It does NOT remove the base prompt's requirement for a natural save/reply/profile path or a specific closing question.");
  lines.push("- If the assigned fingerprint is a non-CTA ending (脱線締め, ノリツッコミ締め, 造語圧縮, etc.), place the reach hook (a concrete question, an invitation to relate, or a soft product mention) EARLIER in the post — then let the fingerprint close the post afterward as atmosphere, not as the only payoff.");
  lines.push("- A post that sounds exactly like 紅茶王子 but gives the reader nothing to reply/save/follow for has failed its job. Voice and reach are both required, not a trade-off.");

  // 禁止リスト
  if (profile.forbidden?.length) {
    lines.push("");
    lines.push("AVOID（これをやったら本人ではなくなる）:");
    for (const f of profile.forbidden) lines.push(`- ${f}`);
  }

  // few-shot
  if (examples.length) {
    lines.push("");
    lines.push("VOICE FEW-SHOT — 声とリズムだけ真似る（事実・数字・トピックはコピーしない）:");
    for (const ex of examples) {
      lines.push("---");
      lines.push(ex);
    }
    lines.push("---");
  }

  return lines.join("\n");
}
