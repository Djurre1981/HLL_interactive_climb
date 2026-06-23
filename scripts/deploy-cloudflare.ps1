#!/usr/bin/env pwsh
# One-time Cloudflare Pages setup after `npx wrangler login`
param(
  [string]$ProjectName = "hll-climb-guide"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Path ".dev.vars")) {
  Write-Error "Missing .dev.vars — copy .dev.vars.example and fill in SESSION_SECRET + ALLOWED_STEAM_IDS"
}

Write-Host "Creating Pages project (if needed)..."
npx wrangler pages project create $ProjectName --production-branch main 2>$null

Write-Host "Uploading secrets from .dev.vars..."
Get-Content ".dev.vars" | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { return }
  $name = $Matches[1]
  $value = $Matches[2].Trim()
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Host "  skip $name (empty)"
    return
  }
  Write-Host "  set $name"
  $value | npx wrangler pages secret put $name --project-name $ProjectName
}

Write-Host "Deploying..."
npm run deploy

Write-Host "Done. Open your project in Cloudflare Pages dashboard for the live URL."
