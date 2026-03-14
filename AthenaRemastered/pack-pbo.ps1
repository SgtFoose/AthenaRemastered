# pack-pbo.ps1
# Packs a directory into an Arma 3 PBO file (uncompressed, with SHA1 footer).
# Usage: .\pack-pbo.ps1 -SourceDir <path> -OutPbo <path.pbo>
#
# PBO format:
#   - Version entry  (empty filename, type=0x56657273, then optional extensions)
#   - File entries   (each: filename\0 + type=0 + orig_size=0 + reserved=0 + mtime + data_size)
#   - Data section   (all file bytes concatenated in header order)
#   - Boundary entry (all-zero 21 bytes)
#   - 0x00 byte
#   - SHA1 of everything above (20 bytes)

param(
    [Parameter(Mandatory)][string]$SourceDir,
    [Parameter(Mandatory)][string]$OutPbo
)

$ErrorActionPreference = "Stop"

function Write-CString([IO.BinaryWriter]$w, [string]$s) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($s)
    $w.Write($bytes)
    $w.Write([byte]0)
}

function Write-UInt32([IO.BinaryWriter]$w, [uint32]$v) {
    $b = [BitConverter]::GetBytes($v)
    $w.Write($b)
}

$SourceDir = (Resolve-Path $SourceDir).Path.TrimEnd('\')
$OutPbo    = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutPbo)

# Collect files relative to source dir, sorted, backslashes (Arma requires backslashes in PBO entry paths)
$files = Get-ChildItem $SourceDir -Recurse -File | Sort-Object FullName
$entries = $files | ForEach-Object {
    $rel = $_.FullName.Substring($SourceDir.Length + 1)  # keep backslashes
    [PSCustomObject]@{
        RelPath  = $rel
        FullPath = $_.FullName
        Content  = [IO.File]::ReadAllBytes($_.FullName)
        MTime    = [uint32][Math]::Floor(($_.LastWriteTimeUtc - [datetime]'1970-01-01').TotalSeconds)
    }
}

# Build the PBO in a MemoryStream so we can SHA1 the whole thing
$ms  = New-Object IO.MemoryStream
$bw  = New-Object IO.BinaryWriter($ms)

# ------- Version / signature entry -------
# Correct BI PBO format: data_size is ALWAYS 0 for the version entry.
# Extension key-value pairs are written INLINE after the 20-byte entry header,
# terminated by a double-null (\0). Arma reads them as strings, not counted bytes.
$prefixValue = "athena"
$extKey = [Text.Encoding]::UTF8.GetBytes("prefix")
$extVal = [Text.Encoding]::UTF8.GetBytes($prefixValue)

Write-CString $bw ""           # empty filename (\0)
Write-UInt32  $bw 0x56657273  # type = 'Vers'
Write-UInt32  $bw 0           # original_size
Write-UInt32  $bw 0           # reserved
Write-UInt32  $bw 0           # timestamp
Write-UInt32  $bw 0           # data_size = always 0 for version entry

# Inline extension strings (NOT counted by data_size):  prefix\0athena\0\0
$bw.Write($extKey)             # "prefix"
$bw.Write([byte]0)             # \0
$bw.Write($extVal)             # "athena"
$bw.Write([byte]0)             # \0
$bw.Write([byte]0)             # extension list terminator (\0)

# ------- File header entries -------
foreach ($e in $entries) {
    Write-CString $bw $e.RelPath
    Write-UInt32  $bw 0                         # uncompressed
    Write-UInt32  $bw 0                         # original_size (0 = use data_size)
    Write-UInt32  $bw 0                         # reserved
    Write-UInt32  $bw $e.MTime
    Write-UInt32  $bw ([uint32]$e.Content.Length)
}

# ------- Boundary (null) entry -------
$bw.Write([byte[]]::new(21))    # 1 byte filename\0 + 5×4 bytes zeros

# ------- Data section -------
foreach ($e in $entries) {
    $bw.Write($e.Content)
}

$bw.Flush()
$allBytes = $ms.ToArray()

# ------- SHA1 footer -------
$sha1 = [Security.Cryptography.SHA1]::Create()
$hash = $sha1.ComputeHash($allBytes)

# Write output file
$outBytes = $allBytes + [byte[]]@(0) + $hash
[IO.File]::WriteAllBytes($OutPbo, $outBytes)

Write-Host "Packed $($entries.Count) files -> $OutPbo ($([Math]::Round($outBytes.Length/1KB,1)) KB)"
