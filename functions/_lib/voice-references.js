// 生成の「人間っぽい声」を司るお手本(few-shot)集。
//
// ここを増やすほど、生成があなたの世界観・話し方に寄っていきます。
// Cowork skill などからの追記も、このファイル1つに集約してください。
//
// 各エントリ: { id, tag, label, text }
//  - text は「声（フランクさ・感情・スラング・絵文字・実名・テンポ）」を真似させる
//    ためのもの。事実や数字はコピーさせない（プロンプト側でその旨を明記済み）。
//  - tag は分類用（milestone / young-male / coaching など）。增やす時の目安に。
//
// 新しいお手本の足し方:
//  1) 下の配列の末尾に { id:"N", tag:"...", label:"...", text:"…実際の良い投稿…" } を追加
//  2) text 内で二重引用符(")は使わず、日本語の「」を使う（JS文字列が壊れないため）
//  3) これだけで生成プロンプトに自動で反映される（renderVoiceReferences が読む）

export const VOICE_REFERENCES = [
  {
    id: "A",
    tag: "milestone",
    label: "emotional milestone, plain spoken + emoji",
    text: "スレッズ始めて80日。50代でも毎日続けてたら、あと少しで400人いきそう。正直、うれしい☺️ みんなさいこ〜🫶"
  },
  {
    id: "B",
    tag: "realization",
    label: "casual realization, slang + 笑",
    text: "毎日30コメントしてみたら、想像と違ったんだよねwww 施策の一つだと思ってたのに、ガチで交流の入口やった🥹 受け身からこっちに変えただけで一気に伸びた。"
  },
  {
    id: "C",
    tag: "opinionated",
    label: "opinionated, repetition + plain form",
    text: "目立ちたいわけじゃないのよ。すごく稼ぎたいわけでもないの。ただ、自分が機嫌よくいられる毎日がほしいだけなんだよね。"
  },
  {
    id: "D",
    tag: "frank-tips",
    label: "frank tips, dialect + warning, light emoji",
    text: "伸ばしたいよね。でも真面目な人ほど、頑張り方を間違えがち。投稿数を増やす、いいね周りを頑張る…行動量が増えると、確実に消耗しちゃう。頑張る方向、間違えないでね😎"
  },
  {
    id: "E",
    tag: "product-hype",
    label: "real product name, hype",
    text: "ChatGPTの新しいやつ、これマジでやばい⁉️ ベンチだけ見たら一個上のモデル超えてる説ある。使ってる人、感想ちょうだい！"
  },
  {
    id: "F",
    tag: "thoughtful",
    label: "thoughtful-but-frank, a sharp metaphor — no emoji needed",
    text: "悪口を気にするかどうかの前に、そもそも誰の意見を聞くかを先に決めておく。信頼できる人の言葉だけ受け取る枠を最初に作る。それ以外は受け取り拒否じゃなくて、そもそも自分宛てじゃない郵便物。開封する理由がない。気にした瞬間、相手と同じステージに降りてる。"
  },
  {
    id: "G",
    tag: "coaching",
    label: "big-brother coaching, rhetorical question + purposeful 体言止め + plain 俺/キミ",
    text: "運用始めたばかりの人へ。「毎日投稿する」って決意、3日くらいで薄れてきてないか？俺もそうだった。理由はシンプルで、決意があいまいだったから。何を・いつ・誰に・どのくらいの長さで書くか、そこまで決めて、やっと習慣になる。最初の一歩は小さく。キミの「毎日投稿」、もう少し細かく決めてみ？"
  },
  {
    id: "H",
    tag: "community",
    label: "warm milestone + community invite, emoji-rich",
    text: "みなさん、絡むなら今ですよ！始めて1ヶ月で80万インプ、880人にフォローしてもらえました♥️ アクティブ層に絡むと『動いてる垢』って認識されて、いろんな人の目につきやすくなるみたい✨ 私を踏み台に、みんな伸びちゃってください😊"
  },
  {
    id: "I",
    tag: "ask-followers",
    label: "casual question straight to followers",
    text: "26歳、あと5日くらいで終わるんだけど…26のうちにやっといた方がいいこと教えて！すぐできそうなやつでお願いします🙏"
  },
  {
    id: "J",
    tag: "young-male",
    label: "young male, 僕/タメ口, self-disclosure + 笑/emoji",
    text: "正直さ、最初の3ヶ月はまじで誰にも読まれてなくて、スマホ伏せて寝るのが日課やったわ😂 でも毎晩ちょっとずつ投稿いじってたら、ある日いきなり伸びた。才能ちゃうねん、ただ「続けた回数」やった。"
  },
  {
    id: "K",
    tag: "young-male",
    label: "young male, 甘め, talking to ONE person",
    text: "きみのその投稿、ぜんぜん悪くないよ。むしろ良い。ただ最初の1行が「説明」になってるだけ。そこを「きみが心の中でつぶやいた一言」に変えると、急に止まるようになる。だまされたと思って明日やってみ？"
  },
  {
    id: "L",
    tag: "young-male",
    label: "young male, hype + real product names + emoji",
    text: "ChatGPTとClaude両方ガッツリ触ってる僕の結論：ネタ出しはChatGPT、文章の温度感はClaudeが強い🥹 1個に絞らんでよくて、作業ごとに使い分けるだけで投稿づくりまじで楽になるで。"
  },
  {
    id: "M",
    tag: "young-male",
    label: "young male, low→warm emotional arc, one-person",
    text: "伸びない日が続くと、自分のセンスを疑うよな。わかる、僕も毎回そう思う。でもな、数字が動かん時はだいたい「誰に向けてるか」がぼやけてるだけ。一人だけ思い浮かべて書いた投稿は、ちゃんと誰かに刺さる。大丈夫、まだ全然いける。"
  }
];

export const VOICE_REFERENCES_NOTICE =
  "Notice across the refs: spoken endings (〜やった / 〜のよ / 〜なんだよね / 〜してみ？), 笑 / www, a sharp metaphor (郵便物), rhetorical questions, a real number, a real opinion, emoji only when it fits, and 体言止め used on purpose once or twice for punch (NOT stacked). Almost no stiff です・ます. Reproduce THIS register for friendly / energetic tones; pick the flavor (emoji-light thoughtful vs. warm-emoji vs. big-brother vs. young-male 僕-voice) that fits the topic and tone.";

// 生成プロンプトに差し込む VOICE REFERENCE ブロック文字列を組み立てる。
export function renderVoiceReferences() {
  const lines = [
    "VOICE REFERENCE — this is the human register to aim for on Threads.",
    "Copy the VOICE (frankness, raw emotion, slang, humor, real numbers, spoken endings, light emoji) — do NOT copy these exact facts, numbers, or topics.",
    ""
  ];
  for (const ref of VOICE_REFERENCES) {
    lines.push(`Ref ${ref.id} (${ref.label}):`);
    lines.push(ref.text);
    lines.push("");
  }
  lines.push(VOICE_REFERENCES_NOTICE);
  return lines.join("\n");
}
