param(
    [string]$DllPath,
    [switch]$AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-DllPath {
    param([string]$InputPath)

    if ($InputPath) {
        return (Resolve-Path -LiteralPath $InputPath).Path
    }

    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $projectRoot = Split-Path -Parent $scriptDir

    $candidates = @(
        (Join-Path $projectRoot "@AthenaRemastered\AthenaServer_x64.dll"),
        (Join-Path $projectRoot "Extension\build\AthenaServer_x64.dll")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw "Could not find AthenaServer_x64.dll automatically. Pass -DllPath explicitly."
}

$resolvedPath = Resolve-DllPath -InputPath $DllPath
$file = Get-Item -LiteralPath $resolvedPath
$hash = Get-FileHash -LiteralPath $resolvedPath -Algorithm SHA256

$metadata = [ordered]@{
    fileName = $file.Name
    fullPath = $file.FullName
    fileSizeBytes = $file.Length
    fileSizeMiB = [Math]::Round($file.Length / 1MB, 3)
    sha256 = $hash.Hash
    fileVersion = $file.VersionInfo.FileVersion
    productVersion = $file.VersionInfo.ProductVersion
    lastWriteTimeUtc = $file.LastWriteTimeUtc.ToString("o")
    generatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
}

if ($AsJson) {
    $metadata | ConvertTo-Json -Depth 3
    exit 0
}

Write-Host "Athena DLL Metadata" -ForegroundColor Cyan
Write-Host "-------------------" -ForegroundColor Cyan
Write-Host ("File Name      : {0}" -f $metadata.fileName)
Write-Host ("Full Path      : {0}" -f $metadata.fullPath)
Write-Host ("Size (bytes)   : {0}" -f $metadata.fileSizeBytes)
Write-Host ("Size (MiB)     : {0}" -f $metadata.fileSizeMiB)
Write-Host ("SHA256         : {0}" -f $metadata.sha256)
Write-Host ("File Version   : {0}" -f $metadata.fileVersion)
Write-Host ("Product Version: {0}" -f $metadata.productVersion)
Write-Host ("Last Write UTC : {0}" -f $metadata.lastWriteTimeUtc)
Write-Host ("Generated UTC  : {0}" -f $metadata.generatedAtUtc)

Write-Host ""
Write-Host "Submission snippet (copy/paste):" -ForegroundColor Yellow
Write-Host ("- File: {0}" -f $metadata.fileName)
Write-Host ("- SHA256: {0}" -f $metadata.sha256)
Write-Host ("- Size: {0} bytes" -f $metadata.fileSizeBytes)
Write-Host ("- ProductVersion: {0}" -f $metadata.productVersion)
