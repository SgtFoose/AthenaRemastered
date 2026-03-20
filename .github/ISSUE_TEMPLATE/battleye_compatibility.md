---
name: BattlEye Compatibility Report
about: Report BattlEye extension loading issues for AthenaServer_x64.dll
title: "[BATTLEYE] "
labels: bug, battleye
assignees: SgtFoose
---

**What happened?**
Describe exactly what failed (for example map never populates, stuck waiting, extension not loading).

**BattlEye message (exact text)**
Paste the exact message if shown, especially any line containing:
`BattlEye: Blocked loading of file ...\AthenaServer_x64.dll`

**RPT log evidence**
Paste relevant lines from `%LOCALAPPDATA%\Arma 3\Arma3_x64_*.rpt`.

**Reproduction steps**
1. Launch method (Arma launcher/Steam launch options)
2. Mod set used
3. Server type (local/dedicated/public)
4. Mission/map
5. What happened next

**Environment**
- Athena Remastered Version:
- Arma 3 Branch (stable/profiling/etc):
- BattlEye Enabled: [Yes/No]
- Windows Version:
- Server Type: [Hosted local / Dedicated private / Dedicated public]
- Other mods loaded:

**Launch options used**
Paste exact launch args from Arma profile.

**DLL metadata (if known)**
If possible, include output from:
`AthenaRemastered/tools/Get-AthenaDllMetadata.ps1`

**Additional context**
Any extra details that could help triage quickly.
