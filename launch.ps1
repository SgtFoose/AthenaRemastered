# Athena Remastered - Launch Script
# Starts the backend API and the frontend dev server, then opens the browser.

$BackendDir  = "$PSScriptRoot\Backend"
$FrontendDir = "$PSScriptRoot\Frontend"
$FrontendUrl = "http://localhost:5173"

# ── Kill any stale instances ────────────────────────────────────────────────
Write-Host "[Athena] Stopping any existing processes..." -ForegroundColor Cyan
Get-Process -Name "AthenaRemastered.Server","dotnet" -ErrorAction SilentlyContinue |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

# ── Backend ──────────────────────────────────────────────────────────────────
Write-Host "[Athena] Starting backend  (http://localhost:5000) ..." -ForegroundColor Green
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoExit","-Command","Set-Location '$BackendDir'; dotnet run --no-build" `
    -WindowStyle Normal

# ── Frontend ─────────────────────────────────────────────────────────────────
Write-Host "[Athena] Starting frontend ($FrontendUrl)  ..." -ForegroundColor Green
Start-Process -FilePath "powershell.exe" `
    -ArgumentList "-NoExit","-Command","Set-Location '$FrontendDir'; npm run dev" `
    -WindowStyle Normal

# ── Wait for backend then open browser ───────────────────────────────────────
Write-Host "[Athena] Waiting for services to be ready..." -ForegroundColor Cyan
$timeout = 30
$elapsed = 0
do {
    Start-Sleep -Seconds 1
    $elapsed++
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:5000/api/game/state" `
                    -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) { break }
    } catch {}
} while ($elapsed -lt $timeout)

if ($elapsed -ge $timeout) {
    Write-Host "[Athena] WARNING: Backend did not respond within ${timeout}s." -ForegroundColor Yellow
} else {
    Write-Host "[Athena] Backend ready. Opening browser..." -ForegroundColor Green
    Start-Process $FrontendUrl
}

Write-Host "[Athena] Done. Backend: http://localhost:5000  |  Frontend: $FrontendUrl" -ForegroundColor Cyan
Write-Host "         Add to Arma 3 Steam launch options:" -ForegroundColor Gray
Write-Host "         -mod=@AthenaRemastered -filePatching -noBE" -ForegroundColor Gray
