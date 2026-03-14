# publish.ps1 — Build a self-contained AthenaRemastered.Server.exe
# Output: AthenaRemastered/publish/
#   AthenaRemastered.Server.exe  (single exe, no .NET runtime required)
#   wwwroot/                     (built frontend)

$ErrorActionPreference = 'Stop'
$Root        = $PSScriptRoot
$BackendDir  = Join-Path $Root 'Backend'
$FrontendDir = Join-Path $Root 'Frontend'
$PublishDir  = Join-Path $Root 'publish'
$WwwRoot     = Join-Path $PublishDir 'wwwroot'

Write-Host '=== Athena Remastered — Publish ===' -ForegroundColor Cyan

# ── 1. Build frontend ────────────────────────────────────────────────────────
Write-Host '[1/3] Building frontend ...' -ForegroundColor Yellow
Push-Location $FrontendDir
if (!(Test-Path 'node_modules')) { npm install }
# Add local node_modules/.bin to PATH so tsc/vite resolve
$env:PATH = (Join-Path $FrontendDir 'node_modules\.bin') + ';' + $env:PATH
npm run build
Pop-Location

# ── 2. Publish backend ───────────────────────────────────────────────────────
Write-Host '[2/3] Publishing backend ...' -ForegroundColor Yellow

# Preserve existing MapCache (runtime data) across publish
$MapCacheDir = Join-Path $PublishDir 'MapCache'
$MapCacheBackup = Join-Path $Root '.MapCache_backup'
if (Test-Path $MapCacheDir) {
    Copy-Item $MapCacheDir $MapCacheBackup -Recurse -Force
}

dotnet publish $BackendDir `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -o $PublishDir

# Restore MapCache after publish
if (Test-Path $MapCacheBackup) {
    if (!(Test-Path $MapCacheDir)) { New-Item -ItemType Directory -Path $MapCacheDir -Force | Out-Null }
    Copy-Item "$MapCacheBackup\*" $MapCacheDir -Recurse -Force
    Remove-Item $MapCacheBackup -Recurse -Force
}

# ── 3. Copy frontend build into wwwroot ───────────────────────────────────────
Write-Host '[3/3] Copying frontend to wwwroot ...' -ForegroundColor Yellow
$FrontendDist = Join-Path $FrontendDir 'dist'
if (Test-Path $WwwRoot) { Remove-Item $WwwRoot -Recurse -Force }
Copy-Item $FrontendDist $WwwRoot -Recurse

# ── Done ──────────────────────────────────────────────────────────────────────
$exe = Join-Path $PublishDir 'AthenaRemastered.Server.exe'
$size = [math]::Round((Get-Item $exe).Length / 1MB, 1)
Write-Host ''
Write-Host "Done!  $exe  ($size MB)" -ForegroundColor Green
Write-Host 'Users run:  AthenaRemastered.Server.exe' -ForegroundColor Green
Write-Host 'Then open:  http://localhost:5000' -ForegroundColor Green
