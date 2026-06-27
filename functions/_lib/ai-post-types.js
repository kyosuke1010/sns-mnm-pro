export const POST_TYPE_PROFILES = {
  empathy: {
    label: "共感型",
    match: ["共感"],
    structure: "悩みの言語化 -> それは自然な反応だと受け止める -> 小さな視点転換 -> 軽い導線",
    mustInclude: ["読者の感情", "あるある場面", "安心感"],
    avoid: ["正論だけ", "説教感", "解決策だけの羅列"]
  },
  save: {
    label: "保存型",
    match: ["保存", "チェックリスト"],
    structure: "後で見返す価値の提示 -> 具体項目 -> 使う場面 -> 保存導線",
    mustInclude: ["具体項目", "再利用できる観点", "保存する理由"],
    avoid: ["抽象的な心構え", "項目名だけ"]
  },
  failure: {
    label: "失敗談型",
    match: ["失敗"],
    structure: "昔の失敗 -> 気づき -> 変えた行動 -> 今の学び -> 軽い導線",
    mustInclude: ["自分の実感", "変化前後", "読者が安心する余白"],
    avoid: ["成功自慢", "失敗の詳細なし"]
  },
  comparison: {
    label: "比較型",
    match: ["比較"],
    structure: "伸びない型と伸びる型の対比 -> 理由 -> 今日の改善案",
    mustInclude: ["対比", "理由", "判断基準"],
    avoid: ["片方だけの説明", "差が曖昧"]
  },
  counter: {
    label: "反論型",
    match: ["反論", "逆張り", "勘違い"],
    structure: "よくある思い込み -> そこではないと否定 -> 正しい見方 -> 行動提案",
    mustInclude: ["視点転換", "理由", "読者が止まる一文"],
    avoid: ["煽りすぎ", "根拠のない断定"]
  },
  story: {
    label: "ストーリー型",
    match: ["ストーリー"],
    structure: "場面 -> 迷い -> 気づき -> 小さな変化 -> 読者への接続",
    mustInclude: ["場面描写", "感情", "変化"],
    avoid: ["説明文だけ", "時系列がない"]
  },
  service: {
    label: "商品導線型",
    match: ["商品", "導線", "案内", "サービス", "販売"],
    structure: "悩み共有 -> 放置した時の詰まり -> 仕組み/ツールの提示 -> 必要な人だけ導線",
    mustInclude: ["読者の困りごと", "売り込み感を抑えた案内", "自然なCTA"],
    avoid: ["機能列挙だけ", "買うべきという圧", "成果保証"]
  },
  education: {
    label: "教育型",
    match: ["教育", "学び"],
    structure: "誤解 -> 本質 -> 実践ステップ -> 保存導線",
    mustInclude: ["誤解", "本質", "実践できる一歩"],
    avoid: ["講義調だけ", "実例なし"]
  }
};

export function resolvePostTypeProfile(type, purpose = "") {
  const text = `${type || ""} ${purpose || ""}`;
  return Object.values(POST_TYPE_PROFILES).find((profile) =>
    profile.match.some((keyword) => text.includes(keyword))
  ) || POST_TYPE_PROFILES.empathy;
}
