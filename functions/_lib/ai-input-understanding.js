export function analyzeUserInput(feature = "", input = {}, profile = {}) {
  const sourceText = pickPrimaryInputText(input);
  const themeText = [input.theme, input.topic, input.topics].filter(Boolean).join("\n");
  const targetText = [input.target, profile.target].filter(Boolean).join(" ");
  const productText = [input.product, profile.product].filter(Boolean).join(" ");
  const purposeText = [input.purpose, profile.purpose, input.type, input.post_type].filter(Boolean).join(" ");
  const keywordText = [input.keyword, input.keywords, profile.keyword].filter(Boolean).join(" ");
  const analysisBase = sourceText || themeText || keywordText || purposeText || targetText || "";
  const combined = [analysisBase, themeText, keywordText, targetText, productText, purposeText].join("\n");

  // When a real source post exists, anchor the topic on it. The talk-theme
  // keyword (継続/案内 etc.) only changes the conversation angle and must NOT
  // hijack reader_problem / key_concept / main_claim away from the post topic.
  const hasSource = Boolean(sourceText.trim());
  const topicBase = hasSource ? sourceText : combined;

  const readerProblem = inferReaderProblem(topicBase, hasSource);
  const keyConcept = inferKeyConcept(topicBase, hasSource ? "" : keywordText, hasSource ? "" : purposeText, hasSource);
  const desiredAction = inferDesiredAction(combined, purposeText, keywordText);
  const riskPoints = inferRiskPoints(combined);
  const metaphor = inferMetaphorOrUniqueExpression(analysisBase);
  const emotionalTone = inferEmotionalTone(combined);
  const salesIntensity = inferSalesIntensity(combined, profile.salesTone || input.sales_intensity || "");
  const targetReader = inferTargetReader(targetText, combined);
  const mainClaim = inferMainClaim(analysisBase, themeText, keyConcept);

  return {
    main_claim: mainClaim,
    reader_problem: readerProblem,
    target_reader: targetReader,
    desired_action: desiredAction,
    key_concept: keyConcept,
    metaphor_or_unique_expression: metaphor,
    emotional_tone: emotionalTone,
    sales_intensity: salesIntensity,
    risk_points: riskPoints,
    best_generation_angle: inferBestGenerationAngle(feature, {
      mainClaim,
      readerProblem,
      keyConcept,
      desiredAction,
      riskPoints,
      sourceText,
      themeText
    }),
    source_priority: sourceText ? "inputText/source/post body" : themeText ? "theme/topic" : keywordText ? "talk-theme keyword" : "generic fallback",
    source_excerpt: truncate(analysisBase, 220)
  };
}

export function pickPrimaryInputText(input = {}) {
  return [
    input.inputText,
    input.post,
    input.source,
    input.text,
    input.body,
    input.postA,
    input.reply
  ].map((value) => String(value || "").trim()).find(Boolean) || "";
}

function inferMainClaim(base = "", theme = "", concept = "") {
  const text = String(base || theme || concept || "").trim();
  if (!text) return "入力テーマに沿って、読者が次に進みやすい投稿にする";
  const sentences = text
    .split(/[。\n!?！？]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const preferred = sentences.find((item) => /ではなく|より|先に|大事|必要|変わる|続き|伝え|整え|決め|止ま/.test(item));
  return truncate(preferred || sentences[0] || text, 120);
}

function inferReaderProblem(text = "", hasSource = false) {
  const value = String(text || "");
  if (/ネタ|書けない|文章化|ゼロから|構成/.test(value)) return "投稿ネタや構成を毎回ゼロから考えて手が止まる";
  if (/AI|違和感|しっくり|自分の言葉|なんか違う/.test(value)) return "AI文が自分の言葉や読者の悩みに合わず、使いにくい";
  if (/続か|継続|習慣|止まる/.test(value)) return "投稿を続けたいのに、負担や迷いで止まりやすい";
  if (/反応|いいね|保存|読まれ|問い合わせ|申込/.test(value)) return "投稿しても反応や次の行動につながらない";
  if (/商品|サービス|案内|売り込み|営業|価格|効果/.test(value)) return "商品やサービスを自然に案内できず、売り込みっぽく見える不安がある";
  if (/設計|導線|型|流れ/.test(value)) return "投稿前の設計や導線が曖昧で、何をどう伝えるか迷っている";
  // A source post exists but matches no SNS-operation bucket: keep the problem
  // anchored on the post topic instead of falling back to a posting-ops theme.
  if (hasSource) {
    const topic = firstMeaningfulSentence(value);
    return topic
      ? `「${topic}」というテーマで、読者が自分の状況や経験を重ねにくい`
      : "投稿テーマについて、読者が自分の状況を重ねにくい";
  }
  return "投稿で何をどう伝えれば読者が動きやすいか迷っている";
}

function inferTargetReader(target = "", text = "") {
  const combined = `${target} ${text}`;
  if (/個人事業主|フリーランス|副業|起業/.test(combined)) return "個人事業主・副業運用者";
  if (/講師|コンサル|先生|スクール/.test(combined)) return "講師・コンサル・専門家";
  if (/店舗|サロン|飲食|来店/.test(combined)) return "店舗・サロン運営者";
  if (/EC|ec|物販|通販|ネットショップ/.test(combined)) return "EC・物販運営者";
  if (/採用|企業|会社|法人/.test(combined)) return "企業・採用担当者";
  return target || "ThreadsやXで発信を続けたい人";
}

function inferDesiredAction(text = "", purpose = "", keyword = "") {
  const combined = `${text} ${purpose} ${keyword}`;
  if (/保存|見返/.test(combined)) return "保存して後から見返してもらう";
  if (/返信|悩み|相談|話しかけ|コメント/.test(combined)) return "読者が自分の状況を自然に話せるようにする";
  if (/プロフィール|固定|URL|リンク/.test(combined)) return "必要な人だけプロフィールや固定投稿へ進める";
  if (/商品|サービス|案内|申込|購入/.test(combined)) return "売り込みすぎず、必要な人だけ案内へ進める";
  return "読者が自分の状況を整理し、次に見るポイントが分かるようにする";
}

function inferKeyConcept(text = "", keyword = "", purpose = "", hasSource = false) {
  const combined = `${text} ${keyword} ${purpose}`;
  if (/型|かたち|テンプレ|地図|設計|流れ/.test(combined)) return "先に型や設計を決めてから投稿を作る";
  if (/悩み|言語化|読者/.test(combined)) return "読者の悩みを先に言語化する";
  if (/冒頭|1行目|最初/.test(combined)) return "冒頭で何の話か一瞬で伝える";
  if (/導線|CTA|返信|保存|プロフィール/.test(combined)) return "読後の行動導線を自然に置く";
  if (/AI|違和感|自分の言葉/.test(combined)) return "AIに任せる前に、誰に何を伝えるかを決める";
  if (/売り込み|案内|商品|サービス/.test(combined)) return "商品説明より先に読者の困りごとを共有する";
  if (hasSource) {
    const topic = firstMeaningfulSentence(text);
    return topic ? `「${topic}」について、読者自身の体験を引き出す` : "投稿テーマについて、読者自身の体験を引き出す";
  }
  return keyword || purpose || "読者の悩みから投稿の流れを作る";
}

function inferMetaphorOrUniqueExpression(text = "") {
  const value = String(text || "");
  const quoted = value.match(/[「『](.+?)[」』]/);
  if (quoted?.[1]) return truncate(quoted[1], 80);
  const metaphorSentence = value.split(/[。\n]/).find((line) => /ような|みたい|たとえ|比喩|地図|鍵|宝|迷路|橋|入口|出口|レール|型/.test(line));
  return metaphorSentence ? truncate(metaphorSentence.trim(), 120) : "";
}

function inferEmotionalTone(text = "") {
  const value = String(text || "");
  if (/不安|怖|迷|止ま|しんど|疲|面倒/.test(value)) return "不安や迷いを含む";
  if (/売り込み|営業|押し/.test(value)) return "売り込みへの抵抗感がある";
  if (/違和感|なんか違う|しっくり/.test(value)) return "違和感を言語化したい";
  if (/変わる|できる|進む|続く/.test(value)) return "前に進める期待がある";
  return "落ち着いた実務寄り";
}

function inferSalesIntensity(text = "", explicit = "") {
  const combined = `${text} ${explicit}`;
  if (/今すぐ|限定|先着|購入|申込|無料プレゼント|特典/.test(combined)) return "強め";
  if (/商品|サービス|価格|案内|プロフィール|URL|リンク/.test(combined)) return "中";
  if (/悩み|保存|見返|相談/.test(combined)) return "弱め";
  return explicit || "弱め";
}

function inferRiskPoints(text = "") {
  const value = String(text || "");
  const risks = [];
  if (/コメント欄に|と返信|返信してください|リプ|DM|欲しい人|無料|特典|資料|プレゼント|合言葉|はいで|「はい」で/.test(value)) risks.push("返信稼ぎ・特典誘導に見える可能性");
  if (/https?:\/\/|URL|リンク|外部/.test(value)) risks.push("外部誘導が強く見える可能性");
  if (/短時間|連投|立て続け|すぐ続けて/.test(value)) risks.push("機械的な連続投稿に見える可能性");
  if (/必ず|絶対|保証|誰でも|確実/.test(value)) risks.push("誇大表現に見える可能性");
  return risks.length ? risks : ["大きなリスクは低め。自然な問いと保存導線を優先"];
}

function inferBestGenerationAngle(feature, context) {
  const claim = context.mainClaim || context.keyConcept || "入力テーマ";
  if (feature === "rewrite") return `元文の主張「${claim}」を保ち、フック・具体性・自然な導線だけを磨く`;
  if (feature === "day-generate") return `朝は悩み共感、昼は原因整理、夜は解決と自然導線で「${claim}」を一日で展開する`;
  if (feature === "thread") return `「${claim}」を投稿1・リプ欄2・リプ欄3へ安全に分割し、CTAは最後だけに弱める`;
  if (feature === "series") return `「${claim}」を複数日に分け、問題提起から解決まで別角度で進める`;
  if (feature === "bulk-generate") return `「${claim}」から共感・保存・導線など別角度の候補を作る`;
  if (["viral", "ab-test", "buzz-pattern", "buzz-research"].includes(feature)) return `入力文の文脈を見て、リスクと改善案を断定せず提示する`;
  if (feature === "cta") {
    const topic = firstMeaningfulSentence(context.sourceText || claim) || claim;
    return `投稿テーマ「${topic}」はそのまま保ち、締めの問いは読者自身の「${topic}」についての体験・状況を聞く。会話目的と話しかけテーマは問いの角度だけを変える`;
  }
  return `「${claim}」を読者の悩みから投稿本文へ落とし込む`;
}

function truncate(value = "", max = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function firstMeaningfulSentence(text = "") {
  const sentence = String(text || "")
    .split(/[。\n!?！？]/)
    .map((item) => item.trim())
    .filter(Boolean)[0] || "";
  return truncate(sentence, 40);
}
