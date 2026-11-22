# Worklog (Athena Remastered)

Purpose: chronological record of every step, fix, investigation and decision in this repository (see `CLAUDE.md`, Rule #1). Earlier history (before 2026-11-22) is in `CHANGELOG.md` and the git log.

## Timeline

### 2026-11-22 — Process + layout: Claude Code setup and repo flatten (Phase 2 step 1 of the Web2 → AR UI core sync)
- Context: the owner moved development from GitHub Copilot to Claude Code (the same process as Athena Web 2) and asked to bring AR and Web2 in sync, including GitHub structure and releases. Plan: Web2 `docs/ui-core-sync.md` (merged in Web2 PR #5).
- **Repo layout flattened** (owner decision: "flatten, like Web2"), branch `chore/flatten-repo-layout`:
  - `git mv` of everything under `AthenaRemastered/` to the repo root: `@AthenaRemastered/`, `Backend/`, `Extension/`, `Frontend/`, `keys/`, `tools/`, `launch.ps1`, `pack-pbo.ps1`, `publish.ps1`. That's 426 renames with history kept.
  - Removed the duplicate root `@AthenaRemastered/` (4 tracked files: `AthenaServerSettings.txt`, `keys/AthenaRemasteredKey.bikey`, `meta.cpp`, `mod.cpp`). All four were byte-identical to the nested copies (checked with `git hash-object`).
  - Stopped tracking `publish/wwwroot` (170 build files): `git rm -r --cached`. They stay on disk; `publish/` was already in `.gitignore`.
  - `Athena Remastered.sln`: project path `AthenaRemastered\Backend\…` → `Backend\…`.
  - `.gitignore`:
    - dropped the nested-path rules
    - dropped the old blanket `@AthenaRemastered/Server/` ignore, which was meant for the removed duplicate; keeping it would have silently ignored new files in the now-canonical `Server/wwwroot`
    - root `@AthenaRemastered/` now uses the specific server-binary rules
  - `publish.ps1` wwwroot targets 6 → 4 (nested/root duplicates collapsed). Removed the old `'..\..\@AthenaRemastered\Server\wwwroot'` target, which pointed **outside** the repository.
  - Docs path references updated: `.github/copilot-instructions.md`, `.github/ISSUE_TEMPLATE/battleye_compatibility.md`, `README.md`, `docs/BATTLEYE_REGISTRATION_AND_RELEASE.md`, `docs/BATTLEYE_SUBMISSION_EMAIL.txt`. `workshop_description.txt` refers to the installed mod folder and is unchanged.
  - `launch.ps1`, `pack-pbo.ps1` and `tools/Get-AthenaDllMetadata.ps1` resolve paths relative to their own location, so no change was needed.
- **Process files added:**
  - `CLAUDE.md`: rules #1–#4, merged Copilot context, AR/Web2 relationship and one-way core sync, new layout, commands, release checklist
  - `WORKLOG.md` (this file)
- Validation:
  - `dotnet build "Athena Remastered.sln"` resolved `Backend\AthenaRemastered.Server.csproj` at the new path, but failed with `NETSDK1045`: this machine only has .NET SDK 8.0.428, and AR targets net9.0. Not caused by the move. Installing the .NET 9 SDK is a pending owner decision.
  - `Frontend`: `npm ci` + `npm run build` passed.
  - No untracked files after the build.
  - Owner approved installing the .NET 9 SDK: `winget install Microsoft.DotNet.SDK.9` → 9.0.321 (side by side with 8.0.428). `dotnet build "Athena Remastered.sln" -c Release` → **Build succeeded, 0 warnings, 0 errors** at the new layout. No untracked files after the build.
- Owner report: the tablet (iPad Safari) and the desktop browser aren't always in sync; Chrome does better than Safari. Candidate causes, to verify:
  - projectile timing compares the server timestamp `ev.at` with the client clock `Date.now()`, so iPad clock skew shifts or hides tracks
  - Safari throttles WebSockets/SignalR and timers more aggressively when the tab or screen is inactive
  - Added to the backlog.
- Owner: the **laze marker** is much better synced and more accurate than the projectile tracks. That fits the clock hypothesis: lazes are server positions drawn as-is in every frame, while projectile tracks are predicted on the client from server timestamp + client clock. Projectile v2's live position sampling makes tracks behave like lazes (real positions).
- Owner approved push + PR, the .NET 9 SDK and the same `main` protection as Web2:
  - pushed `chore/flatten-repo-layout` and opened **PR #1**: https://github.com/SgtFoose/AthenaRemastered/pull/1
  - **Ruleset:**
    - I created a new ruleset "Protect Main" (id 27841089) **without first checking the existing ones**. AR already had "Protect master" (id 27794307: PR required with **1 approval**, no deletion or force-push). Rulesets stack, so PR #1 showed `BLOCKED`, because authors can't approve their own PR.
    - Fix: updated the existing "Protect master" to 0 required approvals (same as Web2's decision) and deleted my duplicate.
    - Result: exactly one ruleset (deletion, non_fast_forward, pull_request approvals=0; admin bypass), and PR #1 `mergeStateStatus: CLEAN`.
    - Lesson: always list existing rulesets before creating one.

### 2026-11-22 — Live test findings (owner, AR v1.1.6 from Steam Workshop, Malden)
- **Startup map:** the backend auto-loads the last-used cached world in the `GameStateService` constructor (`LoadCachedWorld()`), so the UI shows Malden while Arma is still in the main menu, which looks like a stuck game. Planned: drop the auto-load and show the shared core's welcome screen.
- **Main menu:** `init.sqf` is a `postInit` function (`@AthenaRemastered/addons/athena/config.cpp`) with no main-menu guard, so it runs in the menu's background scene and triggers a world export there. Planned: main-menu guard (exact check to be verified live).
- **Repeated export:** `PutMission()` always queues a full `world` export, even for a cached world. On Malden: "Rendering map for: Malden — This may take a few minutes…" at ~16 FPS. Planned: skip the export when cached.
- **Old rendering:** huge square forest blocks, a stair-stepped coastline, sidebars that can't collapse, no I-TGT. These come with the shared core. The forest cell size and Y-flip also need fixing in the C# backend.
- **Projectile tracking:**
  - **M5 MLRS** (`rockets_230mm_GAT`): shots appear in Recent Shots, but there's no track.
  - **M4 Scorcher:** Lock FREE, Src HDG, ETA 5 s, target 5180,11729, with the track running straight north. It falls back to the hull heading because there's no target data.
  - **Mk6 mortar:** the first shot shows a trajectory; after its impact, later shots show none. **After an F5 page refresh new trajectories do appear.**
    - The frontend gets shots only via the live SignalR `Fired` push (`Frontend/src/hooks/useAthenaHub.ts:163`); there's no REST hydration. So F5 simply resets the `recentFired` / `recentFiredImpacts` state.
    - Conclusion: the backend and push work; accumulated client state blocks later shots.
    - Prime suspect: impact matching by shooter+weapon without a per-shot id (`Frontend/src/components/AthenaMap.tsx` `impactLookup`, "previous shot of the same fire mission"). Also the SQF fallback `nearestObjects [_shooterPos, [_ammo], 600]` in `Events/handleFired.sqf`, which can pick a previous shell. Exact line to confirm in a live test.
  - Code smell: the missile profile matches `includes('at')`.
  - Redesign approved: Web2 `docs/ui-core-sync.md` "Design: AR projectile tracking v2" (exact launch vector, physics prediction, live sampling, `Explode` impact, per-projectile id).

## Backlog

- [x] Install the .NET 9 SDK on the dev machine (done 2026-11-22, 9.0.321).
- [ ] Safari vs Chrome sync drift on tablets. Projectile timing should not depend on the client clock: compute a server-clock offset or use server-relative times. Check SignalR reconnect/keep-alive behaviour on iOS Safari.
- [ ] Adopt the shared UI core from Web2 with an AR adapter (SignalR) and `appConfig` (`landmaskRowOrder: 'north-first'`).
- [ ] Backend: drop the startup world auto-load.
- [ ] SQF: main-menu guard in `init.sqf`.
- [ ] Backend: skip the auto world export for cached worlds.
- [ ] Backend: forest cell size (16) + Y-flip fix (as in Web2's bridge).
- [ ] Projectile tracking v2 as an AR extension (fixes the MLRS/M4/mortar bugs).
- [ ] Turn `ATHENA_DEBUG_FIRED` off by default (it currently logs every tracked shell to the RPT).
- [ ] GitHub: branch ruleset like Web2, a release-notes template, tag `v1.1.6`, GitHub Releases.
- [ ] README/About in Web2's structure.
