# Threads API App Review 準備資料（SNS MNM-PRO）

購入者が自分のThreadsアカウントを連携するには、Metaアプリを **ライブモード** にして
**App Review で `threads_basic` の承認**を得る必要があります。
このドキュメントは、その申請にそのまま使える内容をまとめたものです。

> 投稿機能（`threads_content_publish`）は Phase 2-B（実投稿）で使うものなので、
> 今回の申請は **`threads_basic` だけ** でOKです。連携・フォロワー数管理はこれで足ります。

---

## 0. 申請前チェックリスト

- [ ] Meta開発者アカウント／ビジネスの本人確認（求められたら対応）
- [ ] アプリに **Threads API（ユースケース）** が追加されている
- [ ] アプリの **Redirect Callback URLs** に下記が「完全一致」で登録されている
  - `https://sns-mnm-pro-prototype.pages.dev/api/threads/oauth/callback`
- [ ] アプリの基本設定にアイコン・カテゴリ・プライバシーURL・利用規約URLが入っている
- [ ] テスターで一度連携が成功している（審査用デモ動画を撮るため）
- [ ] デモ動画（画面録画）を用意
- [ ] 下記の英語コピペ文を各申請欄に貼り付け

---

## 1. アプリ基本情報（Settings 用）

| 項目 | 値 |
|---|---|
| App display name | SNS MNM-PRO |
| App ID | 1349664103713719 |
| Website / App URL | https://sns-mnm-pro-prototype.pages.dev |
| Privacy Policy URL | https://sns-mnm-pro-prototype.pages.dev/privacy.html |
| Terms of Service URL | https://sns-mnm-pro-prototype.pages.dev/terms.html |
| Data Deletion URL | https://sns-mnm-pro-prototype.pages.dev/data-deletion.html |
| Redirect Callback URL | https://sns-mnm-pro-prototype.pages.dev/api/threads/oauth/callback |
| Support email | support@koucha-lab.com |
| Requested permission | `threads_basic` |

---

## 2. アプリ説明（"How will your app use ..." 欄 / 英語コピペ）

> SNS MNM-PRO is a posting-assistant tool for Threads/X operators. Users generate
> post drafts with their own OpenAI API key, manage and schedule those drafts, and
> review them before posting. The Threads connection is used only to read the
> connected user's own profile and follower count so the user can track their
> follower growth inside the tool. The user explicitly initiates the connection
> with a single "Connect with Threads" button and authorizes it through the
> standard Meta OAuth screen.

日本語要旨：本アプリはThreads/X運用者向けの投稿支援ツール。ユーザー自身のOpenAIキーで
投稿文を生成・管理・予約する。Threads連携は、連携した本人のプロフィールとフォロワー数を
読み取り、フォロワー増減を管理する目的にのみ使用する。

---

## 3. `threads_basic` の利用理由（"Tell us how you're using ..." 欄 / 英語コピペ）

> We request `threads_basic` to read the authenticated user's own Threads profile
> (user id, username) and follower count after they connect via OAuth. This data is
> shown back to the same user inside the "Follower management" screen so they can see
> their current follower count and its change over time. We do not access other
> users' data, we do not post on the user's behalf under this permission, and we do
> not share this data with third parties.

ポイント：
- 取得するのは「連携した本人」の id / username / フォロワー数だけ
- 用途は「本人にフォロワー数を表示する」だけ
- 第三者提供なし・本人以外のデータにアクセスしない

---

## 4. デモ動画の撮影台本（画面録画）

審査では「ユーザーがどうログインし、その権限を何に使うか」が分かる動画が要ります。
以下の流れを1本（1〜2分）で録画してください。

1. アプリのログイン画面 → ログインする
2. サイドメニュー「設定」→「Threads API連携設定」を開く
3. **「Threadsと連携」ボタンを押す**
4. Metaの認可画面が出る → アカウントでログイン → 権限を許可
5. アプリに戻り、「Threads User ID」「フォロワー数」が表示されるのを見せる
6. サイドメニュー「フォロワー数管理」を開き、フォロワー数・増減が表示されるのを見せる
7. （任意）「連携解除」を押すと連携が外れるところも見せる（データ削除の説明になる）

ナレーション/字幕の例（英語）：
> "The user clicks Connect with Threads, authorizes via Meta, and the app then shows
> the user's own follower count for follower-growth tracking. No posting is done."

---

## 5. データの取り扱い（Data handling / 英語コピペ）

> Access tokens are stored encrypted at rest and only the last 4 characters are ever
> displayed. We store the connected user's Threads user id and follower counts to show
> them back to the same user. Users can disconnect at any time from the settings
> screen, which removes the stored connection, and can request deletion via our Data
> Deletion page. We do not sell or share this data with third parties.

実装の裏付け（参考）：
- トークンは暗号化保存、表示は末尾4桁のみ（`functions/_lib/threads-oauth.js` / `security.js`）
- 連携解除で接続情報を削除（`functions/api/threads/oauth/disconnect.js`）
- データ削除ページあり（`/data-deletion.html`）

---

## 6. よくある却下理由と対策

| 却下理由 | 対策 |
|---|---|
| redirect_uri mismatch | Meta側のRedirect URLとアプリの実URLを完全一致に（末尾スラッシュ等も一致） |
| デモ動画で権限の用途が不明 | 「連携→フォロワー数表示」までを必ず映す |
| プライバシー/データ削除が不十分 | 各ページに「何を保存し、どう削除するか」を明記 |
| 開発モードのまま申請 | ライブに切替えてから申請（テスターでの動作確認は事前に） |

---

## 7. 承認後にやること（コード側）

- `index.html` の `THREADS_PUBLIC_BETA` を **`true`** に変更 → 全購入者に「Threadsと連携」を開放
- （任意）"順次開放" の案内文言を撤去

> 承認前は購入者には「順次開放（審査申請中）」と表示され、AI機能はすべて利用可能。
> 管理者は審査前でも自分のアカウントで連携テストができます。
