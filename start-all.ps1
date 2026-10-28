# Bring the voice service, its public tunnel and the carrier webhooks back up.
#   powershell -ExecutionPolicy Bypass -File .\start-all.ps1
# Stops nothing: run it after a reboot, with no voice service already running.
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$voice = Join-Path $root "voice-sales-integration\voice-sales-agent-FULL-with-your-keys\voice-sales-agent"
$tools = Join-Path $root "tools"
$cloudflared = Join-Path $tools "cloudflared.exe"
$log = Join-Path $env:TEMP "agent-caller-tunnel.log"

if (-not (Test-Path $cloudflared)) {
  New-Item -ItemType Directory -Force $tools | Out-Null
  Write-Host "Downloading cloudflared..."
  Invoke-WebRequest "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cloudflared
}

if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
  Write-Host "Port 8000 already in use - stop the old voice service first."
  exit 1
}

Remove-Item $log -ErrorAction SilentlyContinue
Write-Host "Starting tunnel..."
$tunnel = Start-Process $cloudflared -ArgumentList "tunnel", "--url", "http://localhost:8000" -RedirectStandardError $log -PassThru -WindowStyle Hidden

$url = $null
for ($i = 0; $i -lt 120 -and -not $url; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -Last 1
    if ($m) { $url = $m.Matches.Value }
  }
}
if (-not $url) { Write-Host "Tunnel did not come up. See $log"; exit 1 }
Write-Host "Tunnel: $url"

$env:PATH = "$(Join-Path $voice '.venv\Scripts');$(Join-Path $tools 'ffmpeg');$env:PATH"

Write-Host "Re-pointing Telnyx and Twilio at the new URL..."
& (Join-Path $voice ".venv\Scripts\python.exe") (Join-Path $voice "scripts\sync_tunnel.py") $url
if ($LASTEXITCODE -ne 0) { Write-Host "Webhook sync failed"; exit 1 }

Write-Host "Updating the dashboard's copy of the URL and redeploying..."
Push-Location $root
npx vercel env rm VOICE_PUBLIC_URL production --yes 2>$null | Out-Null
$url | npx vercel env add VOICE_PUBLIC_URL production
npx vercel --prod --yes
Pop-Location

Write-Host "Starting voice service..."
Set-Location $voice
& ".venv\Scripts\python.exe" -m app
