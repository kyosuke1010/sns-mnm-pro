# Admin bootstrap debugging

This note is for diagnosing `/api/admin/bootstrap` failures without exposing secrets.

Do not print, paste, commit, or log these values:

- `APP_SECRET`
- Admin password
- Full license key
- OpenAI API key
- Threads Access Token
- Meta App Secret

## Safe API error codes

The bootstrap API returns a safe `error_code` and `message`.

- `BOOTSTRAP_DISABLED`
- `INVALID_APP_SECRET`
- `ADMIN_ALREADY_EXISTS`
- `INVALID_JSON`
- `MISSING_EMAIL`
- `INVALID_EMAIL`
- `MISSING_PASSWORD`
- `PASSWORD_TOO_SHORT`
- `DB_BINDING_MISSING`
- `APP_SECRET_MISSING`
- `EXISTING_ADMIN_CHECK_FAILED`
- `PASSWORD_HASH_FAILED`
- `INSERT_ADMIN_FAILED`
- `INSERT_AUDIT_LOG_FAILED`
- `SESSION_CREATE_FAILED`
- `BOOTSTRAP_UNHANDLED`

## Likely 500 causes

1. `APP_SECRET` is missing in the Cloudflare Pages production environment.
2. `DB` is missing from the latest production deployment.
3. Production D1 migrations have not been applied.
4. The request body field names do not match the API: `email`, `password`, `display_name`.
5. The request is missing `Content-Type: application/json`.
6. `X-App-Secret` does not match `APP_SECRET`.

## Wrangler log tail

Run this in the project folder:

```powershell
cd "C:\Users\user\Documents\New project\threads-ui-tool"
npx.cmd wrangler pages deployment tail --project-name sns-mnm-pro-prototype --environment production --format pretty --search admin_bootstrap
```

Trigger `/api/admin/bootstrap` while the tail session is running.
Look only for `error_code` and sanitized messages.

## Cloudflare Dashboard logs

1. Open Cloudflare Dashboard.
2. Go to Workers & Pages.
3. Select the SNS MNM-PRO Pages project.
4. Open the latest production deployment.
5. Open Functions logs.
6. Search for `admin_bootstrap` and the returned `error_code`.

## Smoke script behavior

The smoke script must always:

1. Temporarily set `ALLOW_ADMIN_BOOTSTRAP=true`.
2. Deploy.
3. Call `/api/admin/bootstrap`.
4. Restore `ALLOW_ADMIN_BOOTSTRAP=false`.
5. Deploy again.
6. Confirm `/api/admin/bootstrap` returns 404.
7. Only then report bootstrap failure details.

Failure output must include only safe fields:

- HTTP status
- `error_code`
- sanitized `message`

