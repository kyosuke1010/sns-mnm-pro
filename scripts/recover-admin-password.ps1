param(
  [string]$BaseUrl = "https://sns-mnm-pro-prototype.pages.dev",
  [string]$ProjectName = "sns-mnm-pro-prototype"
)

$ErrorActionPreference = "Stop"

function Require-Env($Name) {
  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Name is missing. Set it in this PowerShell session before running recovery."
  }
  return $value
}

function Set-BootstrapFlag($Value) {
  $path = Join-Path (Get-Location) "wrangler.jsonc"
  $text = Get-Content $path -Raw
  $replacement = "`"ALLOW_ADMIN_BOOTSTRAP`": `"$Value`""
  if ($text -match '"ALLOW_ADMIN_BOOTSTRAP"\s*:\s*"(true|false)"') {
    $text = $text -replace '"ALLOW_ADMIN_BOOTSTRAP"\s*:\s*"(true|false)"', $replacement
  } else {
    throw "ALLOW_ADMIN_BOOTSTRAP was not found in wrangler.jsonc"
  }
  Set-Content -Path $path -Value $text -Encoding UTF8
}

function Deploy-Pages() {
  $output = & npx.cmd wrangler pages deploy tmp/cloudflare-pages-publish --project-name $ProjectName 2>&1
  $output | ForEach-Object { Write-Host $_ }
  $urlLine = $output | Select-String -Pattern 'https://[a-z0-9]+\.sns-mnm-pro-prototype\.pages\.dev' | Select-Object -Last 1
  if ($urlLine) {
    return [regex]::Match($urlLine.ToString(), 'https://[a-z0-9]+\.sns-mnm-pro-prototype\.pages\.dev').Value
  }
  return $BaseUrl
}

function Invoke-Recovery($Url, $Secret, $Email, $Password) {
  $body = @{
    email = $Email
    password = $Password
  } | ConvertTo-Json -Compress

  try {
    $response = Invoke-WebRequest -Method POST -Uri "$Url/api/admin/recover-password" -Headers @{
      "Content-Type" = "application/json"
      "X-App-Secret" = $Secret
    } -Body $body -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Body = $json }
  } catch {
    if ($_.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $content = $reader.ReadToEnd()
      $json = $null
      try { $json = $content | ConvertFrom-Json } catch {}
      return [pscustomobject]@{ StatusCode = [int]$_.Exception.Response.StatusCode; Body = $json }
    }
    throw
  }
}

$appSecret = Require-Env "APP_SECRET"
$adminEmail = Require-Env "SNS_MNM_ADMIN_EMAIL"
$adminPassword = Require-Env "SNS_MNM_ADMIN_PASSWORD"

Write-Host "Enabling admin recovery temporarily"
Set-BootstrapFlag "true"
$enableUrl = Deploy-Pages
Write-Host "Recovery target URL: $enableUrl"

$recoveryOk = $false
try {
  $result = Invoke-Recovery -Url $enableUrl -Secret $appSecret -Email $adminEmail -Password $adminPassword
  Write-Host ("Recovery result status: " + $result.StatusCode)
  if ($result.StatusCode -ne 200 -or -not $result.Body.ok) {
    $code = if ($result.Body) { $result.Body.error_code } else { "UNKNOWN" }
    throw "Admin recovery failed. error_code=$code"
  }
  $recoveryOk = $true
} finally {
  Write-Host "Disabling admin recovery"
  Set-BootstrapFlag "false"
  $disableUrl = Deploy-Pages
  Write-Host "Recovery disabled deploy URL: $disableUrl"

  $disabled = Invoke-Recovery -Url $BaseUrl -Secret $appSecret -Email $adminEmail -Password $adminPassword
  Write-Host ("Disabled check status: " + $disabled.StatusCode)
  if ($disabled.StatusCode -ne 404) {
    throw "Admin recovery is not disabled. Expected 404."
  }
}

if ($recoveryOk) {
  Write-Host "Admin password recovery completed. Secrets were not printed."
}
