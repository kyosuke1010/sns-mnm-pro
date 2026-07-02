# Codex 指示書｜MNM-PRO 実態あわせ補足（差し込み版）

> このファイルは、別途用意された **「Codex 作業指示書｜SNS MNM-PRO『AI運用チーム層』MVP 実装」**（PDF）に
> **先に貼って読ませる補足ブロック**です。元の指示書は書き換えていません。
> **PDF と本ファイルの内容が食い違う場合は、本ファイル（実態）を優先**してください。
> 理由：元の指示書は「Next.js / React / Python / TypeScript」を前提に書かれていますが、
> MNM-PRO の実装はそれらではありません。下の現状を信じて STEP 1 の現状把握を行ってください。

---

## A. スタックの実態（最優先で上書き）

| 項目 | 元の指示書の前提 | **MNM-PRO の実態** |
|---|---|---|
| 実行基盤 | Next.js / React / Python | **Cloudflare Pages + Pages Functions**（`functions/` 配下）+ **D1**(SQLite) + **KV** |
| 言語 | TypeScript | **素の JavaScript（ESモジュール）**。TypeScript は使っていない |
| フロント | React / Next.js のページ | **素の HTML**（`index.html` / `apply.html`）。コンポーネント機構なし |
| テスト | `*.test.ts`（Jest等） | **node 標準テスト `*.mjs`**（`node --test` で実行）。例：`test/billing.test.mjs` |
| デプロイ | （未記載） | GitHub Actions → `wrangler pages deploy`（`main` ブランチ）。**自動デプロイあり** |

- AI生成は **OpenAI Responses API・モデル `gpt-5.5`・strict JSON schema 出力**。
  共通ヘルパは `functions/_lib/openai.js`（`callOpenAiResponses`, `parseJsonOutput`）。
  **新しい呼び出し方を独自に作らず、必ずこの `callOpenAiResponses` を使う。**
- 買い手は **自分の OpenAI キー**を使う（`ai_settings`、暗号化保存）。キーはユーザーごと。
- ファイル配置例にあった `/lib/orchestrator/intentParser.ts` のような **`/lib` + `.ts` は無い**。
  新規ロジックを置くなら **`functions/_lib/` 配下に素の `.js`**、テストは **`test/*.mjs`**。

---

## B. モジュールA・B は「新規」ではなく「既存の拡張」（重要）

STEP 1 の現状把握で必ず確認すること。**設計書がゼロから作れと言っている2モジュールは、実体がすでにある。**
**新しく並走する別物を作らず、既存を読んで“足りない所だけ”足す方針**にしてください。

### モジュールA（意図解釈）≒ 既存 `functions/_lib/ai-input-understanding-llm.js`
- `understandInput({ apiKey, model, feature, input, profile })` が **LLM1パスで構造化理解**を返す
  （`main_claim` / `reader_problem` / `target_reader` / `desired_action` / `key_concept` /
  `emotional_tone` / `sales_intensity` / `best_generation_angle` …、strict JSON schema）。
- 失敗時は regex 版 `ai-input-understanding.js` の `analyzeUserInput()` に**自動フォールバック**。
- **既存との差分＝今回作る価値があるのはここだけ**：
  既存は「**フォームの構造化入力**」を理解する層。設計書のモジュールAは
  「**自然文の依頼**（例：『今週のThreads投稿を5本作って。商品は〇〇で』）」から
  **本数(`postCount`)・意図・どの機能に流すか**を取り出す“**オーケストレーション層**”。
  → この **依頼文 → {intent, postCount, product, tone, nextLayer}** の薄い前段だけを新規に足し、
  **中身の理解は既存 `understandInput` を呼んで再利用**する（理解ロジックを二重に書かない）。

### モジュールB（QA批評）≒ 既存 `functions/_lib/ai-quality.js`
- `evaluateGenerationQuality(feature, output)` が機械採点し、`shouldRetry` を返す。
  不合格なら `retryInstruction(quality)` で **1回だけ書き直して止める**
  （= 設計書の「fail は1回修正、解消しなければ人間へ／無限ループ禁止」と**既に一致**）。
- 検出観点も既にある：`generic_ending` / `bait` / `meta_explanation` /
  `no_concrete_anchor` / `flat_rhythm` / `taigen_overuse`。
- `generate.js` が **`understand → generate → quality(最大1リライト)`** の順で既に繋いでいる。
- **今回やってよい拡張**：既存は heuristic（規則・正規表現）採点。設計書が欲しがる
  「**生成役とは別の目＝LLM批評**」「pass/warn/fail の verdict」は**新しい付加価値**になりうる。
  ただし **`evaluateGenerationQuality` の閾値・観点・“1リライトで止める”規約を再利用**し、
  **並走する別QAを新設しない**。既存採点に LLM 観点を**足す**形（同じ1リライト枠の中）にする。

> まとめ：**A も B も「既存の上に薄い層を足す」。ゼロから別実装を作ったら重複でNG。**

---

## C.「並列化」の意味を限定（リサーチ層を作らない）

発想元（Agent Swarm / Kimi の解説スライド）は「市場調査を6ソース並列」が花形だが、
**MNM-PRO の MVP では “並列化＝投稿生成とQAの並列” を指す。** リサーチ層は作らない。

- **やる並列**：依頼で「5本」と決まったら、**5本を並列生成 → 各本を独立にQA**。
  （スライドで言う「複数案を出す」「一次整理する」だけをAIに任せる範囲。）
- **やらない並列（非ゴール・釘）**：TikTok / Reddit / YouTube / App Store などの
  **外部ソース並列リサーチ**。MNM-PRO は社外データ取得手段を持たず、Cloudflare＋買い手キーで動く。
  スライドのリサーチ層に引っ張られて調査機能を作り始めないこと。
- 役割分担の原則（スライド Section 7・8 と同じ）：**人間＝判断（検証・どれを出すか決める）／
  AI＝並列処理（複数案・一次整理）**。設計書の「STEP 6 は人間OKまで接続しない」を厳守。

---

## D. セキュリティ・運用の固定ルール（MNM-PRO 側の不文律）

- **シークレット値（OpenAI / PayPal / Resend 等のキー・トークン）を、チャットにもコードにも貼らない。**
  Cloudflare の環境変数（Secrets）に登録し、コードは**変数名で読むだけ**（例：`env.PAYPAL_CLIENT_ID`）。
- `functions/_lib/security.js` のヘルパ（暗号化・ハッシュ等）は**読んで使うだけ。改変しない**。
- `main` への自動マージ・自動 push は禁止（設計書どおり）。ブランチで試作し、人間OK後に接続。

---

## E. 既存で「読むべき」ファイル早見（STEP 1 の近道）

| 役割 | ファイル |
|---|---|
| 生成エンドポイント（A→生成→Bの結線） | `functions/api/ai/generate.js` |
| 意図/入力理解（モジュールAの母体・LLM） | `functions/_lib/ai-input-understanding-llm.js` |
| 同・regexフォールバック | `functions/_lib/ai-input-understanding.js` |
| QA採点（モジュールBの母体） | `functions/_lib/ai-quality.js` |
| OpenAI 呼び出しヘルパ | `functions/_lib/openai.js` |
| プロンプト組み立て・声のルール | `functions/_lib/ai-prompts.js` |
| 人間っぽい声のお手本(few-shot) | `functions/_lib/voice-references.js` |
| プラン制御（Lite/Pro） | `functions/_lib/billing.js`（`isProPlan`） |
| node テストの書き方の手本 | `test/billing.test.mjs`（`node --test test/*.mjs`） |

> STEP 1 の「現状把握サマリー」を出すときは、上の実態（Cloudflare/素のJS、A・Bが既存）を
> 反映した内容にすること。PDF の TypeScript 前提のままサマリーを書いたら、把握不足とみなす。
