# SNS MNM-PRO 生成「声」ガイド（人間味の設計書）

このドキュメントは、AI生成を「人間が書いたみたいに・あなたの世界観に」寄せるための
**声（ボイス）の設計**をまとめたもの。共有用 / 見返し用 / Cowork skill 連携用。

実体は2ファイルに集約されています：

| 何を | どこ |
|---|---|
| 声・体裁のルール（システムプロンプト） | `functions/_lib/ai-prompts.js` の `commonSystemPrompt()` |
| 人間っぽいお手本（few-shot） | `functions/_lib/voice-references.js` の `VOICE_REFERENCES` |

> モデルは OpenAI **gpt-5.5**（Responses API・**strict JSON schema** 出力）。
> どんな改善も「出力はJSONのまま（本文は `posts[].body`）」を維持すること。

---

## 1. お手本(few-shot)の足し方 ← いちばん効く

`functions/_lib/voice-references.js` の `VOICE_REFERENCES` 配列の末尾に1つ足すだけ：

```js
{ id: "N", tag: "young-male", label: "短い説明（英語でOK）", text: "…実際の良い投稿…" }
```

- **text には「これは人間っぽい！」と思える実投稿**を入れる（あなたの神投稿が最強）
- text 内で二重引用符 `"` は使わない → 日本語の `「」` を使う（JS文字列が壊れるため）
- 足したら自動でプロンプトに反映される（`renderVoiceReferences()` が読む）
- GPTは**お手本の声を真似る**ので、ここを増やすほど生成が寄る

### 現在のお手本ラインナップ（声の幅）

| id | tag | 声の特徴 |
|---|---|---|
| A | milestone | 達成感・素直・絵文字（☺️🫶） |
| B | realization | 気づき・スラング・笑（www🥹） |
| C | opinionated | 反復・タメ口（〜のよ/〜なんだよね） |
| D | frank-tips | 助言・方言・軽い警告（😎） |
| E | product-hype | 実名（ChatGPT）＋ハイプ |
| F | thoughtful | 思索的フランク・たとえ（郵便物）・絵文字なし |
| G | coaching | 兄貴系・俺/キミ・狙った体言止め |
| H | community | 実績＋巻き込み・絵文字多め（♥️✨😊） |
| I | ask-followers | フォロワーに素で質問（🙏） |
| J〜M | young-male | 僕/甘め/自己開示/笑い/感情の低→高 |

> **足したい声の隙間**：女性寄りのカジュアル、年配の落ち着き、専門家のキレ、など。

---

## 2. 声・体裁のルール（`commonSystemPrompt` 内）

主要ブロックと狙い：

- **HUMAN VOICE / REGISTER**：アナウンサー口調をやめ、フランクな話し言葉を既定に。
  - 体言止めは1投稿1回まで（連発＝AI臭）。狙った1〜2発はOK。
  - テンプレ骨格（時刻＋ながらスマホ＋👇リスト＋保存＋質問）を**名指しで禁止**。
  - 文末のゆらぎ／接続詞（しかし・また・そして）の削減。
  - **文の長さを不均一に**／**感情の温度を低→高**／**一人に話しかける**。
- **CONCRETENESS WITH REAL NAMES**：AI話題は ChatGPT/Claude 等の**実名**必須。
- **REACH THROUGH HUMAN FEELING**：言葉遊び・たとえ・パロディ・流行りへの乗っかり・交流誘導。
  - **TRUTH LIMIT**：リアルタイム情報は持たない。「今バズってる」と捏造しない。
    実在の人物の固有名詞・日付・関係性を断定しない。`provided_trend` があればそれだけに乗る。
- **締めの質問**：広いカテゴリ禁止。特定の相手・場面・気持ちを名指し（〜ですかー？ で柔らかく）。

### 客観チェック（自動リライトの引き金）
`functions/_lib/ai-quality.js` が機械的に検出 → 不合格なら1回書き直し：
generic_ending / bait / meta_explanation / no_concrete_anchor / flat_rhythm / **taigen_overuse**

---

## 3. トレンドの扱い

- 生成フォームの「今のトレンド・流行り語」欄に入れた言葉は `provided_trend` として渡る。
- プロンプトは「トレンドは**入口**。そこからテーマ → 読者の持ち帰り（例：note記事の切り口）へ橋渡し」。
- AIはリアルタイム流行を知らないので、**ユーザーが渡したトレンドにだけ乗る**（捏造しない）。

---

## 4. Cowork skill 連携の想定フロー（推奨）

1. skill：トレンド受け取り → 投稿の方向性＆お手本案を出す
2. skill：`voice-references.js` への**追記diff**を出す（このファイル1つを狙えば差分がキレイ）
3. 人が一度確認（※お手本は1本悪いと声全体がズレるので**人のOKを挟む**）
4. Claude Code（リポジトリ内）が**コミット → main マージ → 自動デプロイ**

> 「トレンド→自動コミット→自動デプロイ」の全自動は非推奨。提案＝skill、最終OK＝人、が安全。
