param(
  [string]$BaseUrl = "https://sns-mnm-pro-prototype.pages.dev",
  [string]$ProjectName = "sns-mnm-pro-prototype"
)

$ErrorActionPreference = "Stop"

function Read-SecretPlain {
  param([string]$Prompt)
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$names = @(
  "APP_SECRET",
  "SNS_MNM_ADMIN_EMAIL",
  "SNS_MNM_ADMIN_PASSWORD",
  "SNS_MNM_LITE_PASSWORD",
  "SNS_MNM_PRO_PASSWORD"
)

try {
  $env:APP_SECRET = Read-SecretPlain "APP_SECRET"
  $env:SNS_MNM_ADMIN_EMAIL = Read-Host "Admin email"
  $env:SNS_MNM_ADMIN_PASSWORD = Read-SecretPlain "Admin password"
  $env:SNS_MNM_LITE_PASSWORD = Read-SecretPlain "Lite test password"
  $env:SNS_MNM_PRO_PASSWORD = Read-SecretPlain "Pro test password"

  & (Join-Path $PSScriptRoot "run-auth-license-smoke.ps1") -BaseUrl $BaseUrl -ProjectName $ProjectName
} finally {
  foreach ($name in $names) {
    [Environment]::SetEnvironmentVariable($name, $null, "Process")
  }
}
