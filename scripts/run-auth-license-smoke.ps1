param(
  [string]$BaseUrl = "https://sns-mnm-pro-prototype.pages.dev",
  [string]$ProjectName = "sns-mnm-pro-prototype"
)

$ErrorActionPreference = "Stop"

$requiredEnv = @(
  "APP_SECRET",
  "SNS_MNM_ADMIN_EMAIL",
  "SNS_MNM_ADMIN_PASSWORD",
  "SNS_MNM_LITE_PASSWORD",
  "SNS_MNM_PRO_PASSWORD"
)

foreach ($name in $requiredEnv) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    throw "$name is missing. Set it in the local environment. Do not paste the value into chat or source files."
  }
}

$BaseUrl = $BaseUrl.TrimEnd("/")
$wranglerConfig = Join-Path (Get-Location) "wrangler.jsonc"
$originalWrangler = Get-Content -LiteralPath $wranglerConfig -Raw

function Set-BootstrapFlag {
  param([string]$Value)
  $content = Get-Content -LiteralPath $wranglerConfig -Raw
  if ($content -notmatch '"ALLOW_ADMIN_BOOTSTRAP"\s*:\s*"[^"]+"') {
    throw "ALLOW_ADMIN_BOOTSTRAP is not present in wrangler.jsonc"
  }
  $content = $content -replace '"ALLOW_ADMIN_BOOTSTRAP"\s*:\s*"[^"]+"', ('"ALLOW_ADMIN_BOOTSTRAP": "' + $Value + '"')
  Set-Content -LiteralPath $wranglerConfig -Value $content -Encoding UTF8
}

function Publish-Pages {
  $publish = Join-Path (Get-Location) "tmp\cloudflare-pages-publish"
  $base = (Resolve-Path .).Path
  if (Test-Path $publish) {
    $resolvedPublish = (Resolve-Path $publish).Path
    if (-not $resolvedPublish.StartsWith($base)) {
      throw "Refusing to remove outside project: $resolvedPublish"
    }
    Remove-Item -LiteralPath $resolvedPublish -Recurse -Force
  }
  New-Item -ItemType Directory -Path $publish | Out-Null
$items = @("index.html", "login.html", "apply.html", "legal.html", "terms.html", "privacy.html", "data-deletion.html", "_redirects", "admin.html", "admin", "preview", "assets", "functions", "docs", "migrations")
  foreach ($item in $items) {
    if (Test-Path $item) {
      Copy-Item -LiteralPath $item -Destination $publish -Recurse -Force
    }
  }
  $outputLines = New-Object System.Collections.Generic.List[string]
  & npx.cmd wrangler pages deploy ".\tmp\cloudflare-pages-publish" --project-name $ProjectName 2>&1 | ForEach-Object {
    $line = $_.ToString()
    $outputLines.Add($line) | Out-Null
    Write-Host $line
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler deploy failed with exit code $LASTEXITCODE"
  }

  $deployUrl = $null
  foreach ($line in $outputLines) {
    $matches = [regex]::Matches($line, 'https://[^\s]+?\.pages\.dev')
    foreach ($match in $matches) {
      $deployUrl = $match.Value.TrimEnd("/")
    }
  }
  if ([string]::IsNullOrWhiteSpace($deployUrl)) {
    throw "Could not detect Cloudflare Pages deploy URL from wrangler output"
  }
  return $deployUrl
}

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null,
    [hashtable]$Headers = @{},
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session = $null
  )
  $params = @{
    Uri = $Url
    Method = $Method
    Headers = $Headers
    UseBasicParsing = $true
  }
  if ($Session) { $params.WebSession = $Session }
  if ($Body -ne $null) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
  }
  try {
    $response = Invoke-WebRequest @params
    $json = $null
    if ($response.Content) { $json = $response.Content | ConvertFrom-Json }
    return @{ Status = [int]$response.StatusCode; Json = $json; Raw = $response }
  } catch {
    $status = 0
    $json = $null
    $body = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $body = $_.ErrorDetails.Message
    } elseif ($_.Exception.Response) {
      try {
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream) {
          $reader = New-Object System.IO.StreamReader($stream)
          $body = $reader.ReadToEnd()
        }
      } catch {
        $body = $null
      }
    }
    if ($body) {
      try { $json = $body | ConvertFrom-Json } catch { $json = $null }
    }
    return @{ Status = $status; Json = $json; Raw = $_.Exception.Response; Body = $body }
  }
}

function Assert-Status {
  param([string]$Label, [int]$Actual, [int[]]$Expected)
  if ($Expected -notcontains $Actual) {
    throw "$Label failed. Expected $($Expected -join '/') but got $Actual"
  }
  Write-Host "OK $Label => $Actual"
}

function Get-SafeApiError {
  param([hashtable]$Result)
  if ($Result -and $Result.Json) {
    $code = $Result.Json.error_code
    if (-not $code) { $code = $Result.Json.error }
    $message = $Result.Json.message
    if (-not $message) { $message = $Result.Json.error }
    if ($code -or $message) {
      return ("error_code={0}; message={1}" -f (Mask-SensitiveText $code), (Mask-SensitiveText $message))
    }
  }
  if ($Result -and $Result.Body) {
    return ("body={0}" -f (Mask-SensitiveText ($Result.Body.Substring(0, [Math]::Min(240, $Result.Body.Length)))))
  }
  return "no response body"
}

function Mask-SensitiveText {
  param([object]$Value)
  $text = [string]$Value
  if ([string]::IsNullOrWhiteSpace($text)) { return "" }
  $text = $text -replace 'sk-[A-Za-z0-9_-]+', 'sk-****'
  $text = $text -replace 'SNS-MNM-[A-Z0-9-]+', 'SNS-MNM-****'
  return $text
}

$bootstrapFailure = $null
$bootstrapResult = $null
$enableDeployUrl = $null
$disableDeployUrl = $null
$bootstrapTargetUrl = $null

try {
  Write-Host "Enabling admin bootstrap temporarily"
  Set-BootstrapFlag "true"
  $enableDeployUrl = Publish-Pages
  Write-Host "enable deploy URL: $enableDeployUrl"
  Write-Host "production URL: $BaseUrl"

  $bootstrapTargetUrl = "$enableDeployUrl/api/admin/bootstrap"
  Write-Host "bootstrap target URL: $bootstrapTargetUrl"

  $bootstrap = Invoke-Json -Method "POST" -Url $bootstrapTargetUrl -Headers @{ "X-App-Secret" = $env:APP_SECRET } -Body @{
    email = $env:SNS_MNM_ADMIN_EMAIL
    password = $env:SNS_MNM_ADMIN_PASSWORD
    display_name = "KOUCHA-LAB Admin"
  }
  Write-Host "bootstrap result status: $($bootstrap.Status)"
  $bootstrapResult = $bootstrap
  if ($bootstrap.Status -eq 409) {
    Write-Host "OK admin already exists"
  } elseif ($bootstrap.Status -eq 200) {
    Write-Host "OK admin bootstrap => 200"
    if ($bootstrap.Json -and $bootstrap.Json.warning_code) {
      Write-Host ("WARN admin bootstrap warning_code={0}" -f (Mask-SensitiveText $bootstrap.Json.warning_code))
    }
  } else {
    $bootstrapFailure = "admin bootstrap failed. Expected 200 but got $($bootstrap.Status). $(Get-SafeApiError $bootstrap)"
  }
} catch {
  $bootstrapFailure = "admin bootstrap step failed before completion. $(Mask-SensitiveText $_.Exception.Message)"
} finally {
  Write-Host "Disabling admin bootstrap"
  Set-Content -LiteralPath $wranglerConfig -Value $originalWrangler -Encoding UTF8
  $disableDeployUrl = Publish-Pages
  Write-Host "disable deploy URL: $disableDeployUrl"
}

$disabledCheckUrl = "$disableDeployUrl/api/admin/bootstrap"
Write-Host "bootstrap disabled check URL: $disabledCheckUrl"
$disabled = Invoke-Json -Method "POST" -Url $disabledCheckUrl -Body @{}
Write-Host "bootstrap disabled check result: $($disabled.Status)"
Assert-Status "bootstrap disabled" $disabled.Status @(401, 403, 404)

if ($bootstrapFailure) {
  throw $bootstrapFailure
}

$adminSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$adminLogin = Invoke-Json -Method "POST" -Url "$BaseUrl/api/auth/admin-login" -Session $adminSession -Body @{
  email = $env:SNS_MNM_ADMIN_EMAIL
  password = $env:SNS_MNM_ADMIN_PASSWORD
}
Assert-Status "admin login" $adminLogin.Status @(200)

$normalAdminLogin = Invoke-Json -Method "POST" -Url "$BaseUrl/api/auth/login" -Body @{
  email = $env:SNS_MNM_ADMIN_EMAIL
  password = $env:SNS_MNM_ADMIN_PASSWORD
}
Assert-Status "normal login rejects admin" $normalAdminLogin.Status @(403)

$adminMe = Invoke-Json -Method "GET" -Url "$BaseUrl/api/admin/me" -Session $adminSession
Assert-Status "admin me" $adminMe.Status @(200)

$licenseLite = Invoke-Json -Method "POST" -Url "$BaseUrl/api/admin/licenses/issue" -Session $adminSession -Body @{
  buyer_name = "Test Lite User"
  payment_name = "TEST LITE USER"
  email = "test-lite@example.com"
  plan = "lite"
  stripe_payment_id = "pi_test_lite"
}
Assert-Status "Lite license issue" $licenseLite.Status @(200)

$licensePro = Invoke-Json -Method "POST" -Url "$BaseUrl/api/admin/licenses/issue" -Session $adminSession -Body @{
  buyer_name = "Test Pro User"
  payment_name = "TEST PRO USER"
  email = "test-pro@example.com"
  plan = "pro"
  stripe_payment_id = "pi_test_pro"
}
Assert-Status "Pro license issue" $licensePro.Status @(200)

$liteSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$liteRegister = Invoke-Json -Method "POST" -Url "$BaseUrl/api/auth/register" -Session $liteSession -Body @{
  email = "test-lite@example.com"
  license_key = $licenseLite.Json.license.license_key
  password = $env:SNS_MNM_LITE_PASSWORD
  password_confirm = $env:SNS_MNM_LITE_PASSWORD
}
Assert-Status "Lite first registration" $liteRegister.Status @(200)

$proSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$proRegister = Invoke-Json -Method "POST" -Url "$BaseUrl/api/auth/register" -Session $proSession -Body @{
  email = "test-pro@example.com"
  license_key = $licensePro.Json.license.license_key
  password = $env:SNS_MNM_PRO_PASSWORD
  password_confirm = $env:SNS_MNM_PRO_PASSWORD
}
Assert-Status "Pro first registration" $proRegister.Status @(200)

$liteSessionCheck = Invoke-Json -Method "GET" -Url "$BaseUrl/api/auth/session" -Session $liteSession
Assert-Status "Lite session" $liteSessionCheck.Status @(200)

$proThreadsSave = Invoke-Json -Method "POST" -Url "$BaseUrl/api/settings/threads" -Session $proSession -Body @{
  meta_app_id = "test_meta_app"
  meta_app_secret = "dummy_meta_secret_for_dry_run_only"
  threads_user_id = "test_threads_user"
  access_token = "dummy_access_token_for_dry_run_only"
  token_expires_at = "2026-12-31T00:00:00.000Z"
}
Assert-Status "Threads settings save" $proThreadsSave.Status @(200)

$threadsDryRun = Invoke-Json -Method "POST" -Url "$BaseUrl/api/threads/test" -Body @{
  metaAppId = "test_meta_app"
  threadsUserId = "test_threads_user"
  accessToken = "dummy_access_token_for_dry_run_only"
}
Assert-Status "Threads API dry run" $threadsDryRun.Status @(200)

$followersDryRun = Invoke-Json -Method "POST" -Url "$BaseUrl/api/threads/followers" -Body @{
  metaAppId = "test_meta_app"
  threadsUserId = "test_threads_user"
  accessToken = "test_access_token_5678"
}
Assert-Status "Followers dry run" $followersDryRun.Status @(200)

$logout = Invoke-Json -Method "POST" -Url "$BaseUrl/api/auth/logout" -Session $liteSession
Assert-Status "Lite logout" $logout.Status @(200)

$afterLogout = Invoke-Json -Method "GET" -Url "$BaseUrl/api/auth/session" -Session $liteSession
Assert-Status "Lite session after logout" $afterLogout.Status @(401)

Write-Host "Smoke test completed. Secrets and full license keys were not printed."
