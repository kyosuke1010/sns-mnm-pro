export const TONE_PROFILES = {
  supportive: {
    label: "寄り添う形",
    match: ["寄り添", "優しい", "やわらか"],
    opening: "読者のしんどさを先に受け止める",
    denial: "強く否定せず、見方を少しずらす",
    empathy: "多め",
    assertion: "弱めから中",
    rhythm: "余白を作り、短い文を混ぜる",
    cta: "相手が断れる余白を残す",
    sales: "弱め",
    vocabulary: ["無理に", "まずは", "それでも大丈夫", "少しずつ"]
  },
  friendly: {
    label: "親しみやすい",
    match: ["親しみ", "フランク", "会話"],
    opening: "日常のあるあるから入る",
    denial: "軽く言い切ってテンポを作る",
    empathy: "中から多め",
    assertion: "中",
    rhythm: "会話感と読みやすい改行",
    cta: "返信や保存を自然に促す",
    sales: "弱めから中",
    vocabulary: ["これ", "じつは", "ありがち", "ここだけ"]
  },
  logical: {
    label: "論理的",
    match: ["論理", "プロ", "専門", "分析"],
    opening: "結論やズレの指摘から入る",
    denial: "理由を添えて明確に否定する",
    empathy: "少なめから中",
    assertion: "強め",
    rhythm: "短い結論、理由、手順",
    cta: "次に確認する行動を明確にする",
    sales: "中",
    vocabulary: ["原因", "設計", "構造", "順番", "判断"]
  },
  energetic: {
    label: "熱量高め",
    match: ["熱量", "背中", "強め", "自信"],
    opening: "強い一文で止める",
    denial: "はっきり否定して視点転換する",
    empathy: "中",
    assertion: "強め",
    rhythm: "短く勢いのある文を混ぜる",
    cta: "今すぐできる一歩を置く",
    sales: "中から強め",
    vocabulary: ["そこじゃない", "変えられます", "今日から", "まず一つ"]
  },
  concise: {
    label: "短文",
    match: ["短文", "短く", "X向け"],
    opening: "一撃で意味が伝わる短いフック",
    denial: "短く鋭く否定する",
    empathy: "少なめ",
    assertion: "中から強め",
    rhythm: "冗長説明を削り、1文の密度を上げる",
    cta: "短い保存/返信導線",
    sales: "弱めから中",
    vocabulary: ["結論", "違います", "要点", "まず"]
  },
  sales_soft: {
    label: "やわらかい案内型",
    match: ["案内", "販売", "サービス", "商品"],
    opening: "悩みを共有してから案内へ移る",
    denial: "売り込みではなく解決の順番として見せる",
    empathy: "中から多め",
    assertion: "中",
    rhythm: "押しすぎず、必要な人だけ拾う",
    cta: "固定、プロフィール、返信へ軽く誘導",
    sales: "中",
    vocabulary: ["必要な人だけ", "確認できます", "まとめています", "無理にではなく"]
  }
};

export function resolveToneProfile(tone) {
  const text = String(tone || "");
  const profiles = Object.values(TONE_PROFILES);
  const exact = profiles.find((profile) => text === profile.label);
  if (exact) return exact;
  return profiles.find((profile) =>
    profile.match.some((keyword) => text.includes(keyword))
  ) || TONE_PROFILES.friendly;
}
