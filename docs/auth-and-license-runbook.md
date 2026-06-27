# SNS MNM-PRO 認証・ライセンス運用手順

作成日: 2026-06-21

## URL

- 通常サイト: `https://sns-mnm-pro-prototype.pages.dev/`
- 購入者ログイン: `https://sns-mnm-pro-prototype.pages.dev/login.html`
- 初回登録: `https://sns-mnm-pro-prototype.pages.dev/login.html` の「初回登録」タブ
- 無料トライアル予定者/購入予定者向け申し込み: `https://sns-mnm-pro-prototype.pages.dev/apply.html`
- プラン確認: `https://sns-mnm-pro-prototype.pages.dev/?page=billing`
- 管理者URL: `https://sns-mnm-pro-prototype.pages.dev/admin`
- 特商法: `https://sns-mnm-pro-prototype.pages.dev/legal.html`

## Binding

- D1: `DB`
- KV: `SESSION_KV`

## Secrets

- `APP_SECRET`
- `ENCRYPTION_KEY`
- `STRIPE_SECRET_KEY`
- `OPENAI_ENCRYPTION_KEY`
- `THREADS_ENCRYPTION_KEY`

Secret値は表示・ログ出力しない。

## 実装済みAPI

### 初回登録

`POST /api/auth/register`

入力:

```json
{
  "email": "buyer@example.com",
  "license_key": "SNS-MNM-XXXX-XXXX-XXXX",
  "password": "password",
  "password_confirm": "password"
}
```

処理:

- email形式チェック
- password一致チェック
- license keyを`APP_SECRET`付きhash化
- `licenses.license_hash`照合
- `unused` licenseのみ許可
- license email一致チェック
- password hash保存
- users作成
- licenseをactive化
- HttpOnly Cookie発行

### 通常ログイン

`POST /api/auth/login`

入力:

```json
{
  "email": "buyer@example.com",
  "password": "password"
}
```

処理:

- users.email検索
- PBKDF2 hash照合
- user.status確認
- 一般ユーザーはactive license確認
- HttpOnly Cookie発行
- adminは`/admin`へ、一般ユーザーは`/index.html?page=dashboard`へ

### セッション確認

`GET /api/auth/session`

Cookieからセッションを確認し、role/planを返す。

### ログアウト

`POST /api/auth/logout`

D1 sessionをrevokedにし、`SESSION_KV` cacheを削除し、Cookieを削除する。

### 管理者確認

`GET /api/admin/me`

`role=admin`のみ許可。

### 管理者ライセンス発行

`POST /api/admin/licenses/issue`

管理者セッション必須。発行直後のみ`license_key`全文を返す。

入力:

```json
{
  "email": "buyer@example.com",
  "plan": "lite",
  "buyer_name": "購入者名",
  "payment_name": "決済名義",
  "stripe_payment_id": "pi_xxx",
  "memo": "管理メモ"
}
```

### 初期管理者bootstrap

`POST /api/admin/bootstrap`

通常は無効。`ALLOW_ADMIN_BOOTSTRAP=true` かつ `X-App-Secret` が `APP_SECRET` と一致した場合のみ使える。

管理者作成後は必ず `ALLOW_ADMIN_BOOTSTRAP=false` に戻す。

## /admin保護

`functions/_middleware.js` により以下をサーバー側で保護する。

- `/admin`
- `/admin.html`
- `/api/admin/*`

一般ユーザーまたは未ログインの場合は管理HTMLを返さない。

## ライセンス発行から購入者初回登録まで

1. 管理者が `/admin` にログイン
2. 管理者APIまたは管理画面からライセンス発行
3. 発行直後に表示されたライセンスキー全文を購入者へ送付
4. 購入者が `/login.html` の初回登録タブで email/license/password を入力
5. licenseがactiveになり、ユーザーに紐づく
6. 以後はemail/passwordでログイン

## 未実装

- Stripe Webhookによる自動ライセンス発行
- OpenAI API実送信
- Threads実投稿送信
- X API連携
- 複数アカウント実装

