# Worklog (Athena Remastered)

Purpose: chronological record of every step, fix, investigation and decision in this repository (see `CLAUDE.md`, Rule #1). Earlier history (before 2026-11-22) is in `CHANGELOG.md` and the git log.

## Timeline

### 2026-11-22 — Forest overlay: Bus 16 m cells from the Athena Desktop cache, no single-tree cells
- **Owner report (screenshots: Web2 on Tanoa vs AR v1.2.0-test on Malden):** AR's forest overlay is way too dense compared to Web2. Also "two finger pinch zoom is too slow" (device to be clarified: trackpad pinch vs tablet touch; same Leaflet settings in both apps via the shared core: `zoomSnap 0.1`, `zoomDelta 0.25`, `wheelPxPerZoomLevel 80`).
- **Cause:**
  - AR's `getForests.sqf` samples 150 m cells and counts trees within 75 m: level 1 = ≥1, 2 = ≥5, 3 = ≥15. The backend dropped only level 0, and the core draws every level below 3 as light forest. Almost every cell with one tree was painted green (Malden: 2512 of ~7300 cells).
  - Web2 instead shows Bus's own `Forests.txt` (16 m light/heavy cells).
- **Fix** (branch `fix/forest-desktop-cache`, stacked on `fix/persistent-map-cache`):
  - `Backend/Services/StaticAthenaCacheService.cs`: `LoadDesktopForests()` parses `Forests.txt` exactly like Web2's bridge: 16 m cells, `CellsLight` → level 2, `CellsHeavy` → level 3 (heavy wins), Y = worldSize − (yIdx + 1) × 16.
  - `Backend/Services/GameStateService.cs`: `ResolveDisplayForests()` prefers the Desktop cells and otherwise filters the in-game export to level ≥ 2 (`MinInGameForestLevel`). It is used when loading from MapCache and at `PutForestsComplete()`; the raw export is still cached unchanged.
  - Docs: `CHANGELOG.md` (1.2.0 Fixed), `CLAUDE.md` (forest source).
- **Validation:**
  - `dotnet build Backend -c Release` passed (0 warnings).
  - Simulation with `ATHENA_MAPCACHE_DIR` and a temporary fake Desktop `Forests.txt` (removed afterwards):
    - `deskworld` (1024 m) → `sampleSize=16`, cells `(0,1008,L2) (16,1008,L3) (32,928,L2) (48,960,L3)`, as expected
    - `filterworld` (MapCache only, levels 1/2/3/1) → `sampleSize=150`, cells `(150,0,L2) (300,0,L3)`

### 2026-11-22 — Map cache in Documents: no re-export after updates or new install folders
- **Owner report (photo, old build `299e25b`):** "Exporting world data…" again on game start (Roads 250…, Trees 3500…, Locations 122 OK). Request: both tools must check for cached maps when the game starts and not trigger a new render every time.
- **Findings:**
  - **Web2:** never exports by itself. Static layers come from the Athena Desktop cache (`Documents\Athena\Maps`), and `startMapExport` is only sent by the "Export World Data" button (`App.tsx` `handleRequestWorld` → `useAthenaHub.requestWorldExport`). No change needed.
  - **AR:** `PutWorldInfo()` already checks the cache and only queues missing parts. But `MapCacheService` stored the cache in `MapCache\` **beside the server EXE**, so every new folder (test packages, a moved EXE, possibly a Workshop update) started empty and re-exported the whole world.
- **Fix** (branch `fix/persistent-map-cache`, stacked on `fix/vehicle-nato-markers`):
  - `Backend/Services/MapCacheService.cs`:
    - cache root is `Documents\AthenaRemastered\MapCache` (override `ATHENA_MAPCACHE_DIR`; falls back to the EXE folder if Documents is unavailable), logged at startup
    - one-time migration copies a legacy EXE-side `MapCache` into the new root without overwriting existing files; the legacy folder is kept
  - Docs: `CHANGELOG.md` (1.2.0 Changed/Fixed), `CLAUDE.md` (AR map cache section), `publish.ps1` comment.
- **Validation:**
  - `dotnet build Backend -c Release` passed (0 warnings).
  - Simulation with a legacy cache for `testworld` next to the EXE and `ATHENA_MAPCACHE_DIR` set to an empty folder: log showed "Migrated 7 map cache file(s)". After `mission` + `world`, `/api/game/request` returned no export requests.
  - Control run without any cache: `roads, trees, forests, locations, structures, elevations` were queued.

### 2026-11-22 — Vehicle markers: upright NATO symbols, real crew seats (core sync) + test package
- **Owner report (v1.2.0-test, Malden):** "vehicle icons look weird". They showed as large tilted blue rectangles with a dot, with crew labelled `P:`. Root cause is in the shared core (details in Web2's WORKLOG):
  - the NATO `b_art` frame used for static naval turrets (Mk41 VLS, Mk45 Hammer) and SAM/AAA was rotated with the turret heading at 80 px
  - crew prefixes ignored the `fullCrew` seat sent by `getVehicles.sqf`
- Core sync from Web2 `94c4f28` (branch `fix/vehicle-nato-markers`, stacked on `fix/backend-startup-export-stale`, commit `a744c43`): `Frontend/src/core/components/AthenaMap.tsx` + `core-manifest.json`.
- Validation: put-API simulation against the published `test (a744c43)` server showed upright 48 px markers with `G:` labels for the UAV-AI gunners.
- **Test package:** `D:` no longer exists on this machine, so the package went to `C:\AthenaRemastered-test\`:
  - `Server\` is a copy of `publish\`: the backend fixes + this core fix, label `test (a744c43)`
  - `athena.pbo` packed with `pack-pbo.ps1` from `@AthenaRemastered/addons/athena`: Eden/main-menu guard, new map messages; unsigned, run with `-noBE`
  - The tracked `@AthenaRemastered/Server/wwwroot` that `publish.ps1` rewrites was restored afterwards.
- Owner photo afterwards: the header label `v1.2.0-test (299e25b)` still pushes "Donate" off screen. That is the old build from before the label fix (`299e25b`). The compact header label (`v1.2.0-test`) is in the new package (`test (a744c43)`), so there is nothing new to fix; the owner needs to run the new server.

### 2026-11-22 — Backend/SQF fixes: no startup world, stale mission expiry, honest map message, Eden/main-menu guard
- PR #3 (version 1.2.0 + build label) merged by the owner as `eac69b7`. The test build on `D:` (`1.2.0-test (299e25b)`) matches `main`'s code (0 files differ).
- **Owner live test of v1.2.0-test on Malden** (screenshot): new rendering works (coastline, contours, Bus colours, labels; forest semi-transparent). Remaining issues:
  - the forest is still AR's in-game 150 m grid → next item (forest from the Athena Desktop cache)
  - the long version label pushed "Donate" out of the header (horizontal scrollbar) → fixed in the core below
  - "Exporting world data…" on Malden: the test EXE on `D:` has its own empty `MapCache` next to the EXE, so a one-time re-export is expected
- **Owner observation: in the Eden editor (no mission started) AR connected and ran a full Stratis export** (roads, forests at 150 m, structures, locations, elevations, trees). It confirms the postInit runs outside real missions.
- **Correction of an earlier diagnosis:** the "repeated full export on every mission start" isn't real when AR's own `MapCache` is complete. `PutWorldInfo()` loads cached geometry and only queues exports for missing data. On every mission start, `getWorld.sqf` (cheap config reads) still showed "Rendering map … This may take a few minutes…", which was misleading. The ~16 FPS seen earlier on Malden likely had another cause.
- Changes (branch `fix/backend-startup-export-stale`):
  - `Backend/Services/GameStateService.cs`:
    - no world auto-load in the constructor; the unused `LoadCachedWorld()` was removed (61 lines)
    - new `ExpireStaleMission()` + `MissionStaleTimeout` (30 s). Frames (`PutUpdateEnd`) and `PutMission` refresh `_lastFrameUtc`. On expiry it clears mission/world/units/groups/vehicles/lazes/dead units, drains queued export requests, resets the export status to idle and broadcasts an empty frame.
  - `Backend/Services/BroadcastService.cs`: 5 s timer calls `ExpireStaleMission`; `IDisposable`.
  - `Frontend/src/adapter/useAthenaHub.ts`: `onreconnecting` → `connected=false` immediately.
  - `@AthenaRemastered/addons/athena/World/getWorld.sqf`: hint/systemChat now "Loading map data for X (cached maps load instantly)".
  - `@AthenaRemastered/addons/athena/init.sqf`:
    - exits when `is3DEN` (Eden editor) or when the main menu display (`findDisplay 0`) is open
    - logs `Athena Init: context is3DEN/mainMenu/missionDisplay/missionName` to the RPT
    - The main-menu check isn't an official Arma API, so verify it live via the RPT.
  - Core re-synced from Web2 (`459bc81`, `b2c5ae8`): header label truncation, compact header label `v1.2.0-test` with the full label in footer/tooltip.
- Validation:
  - `dotnet build` 0 warnings / 0 errors; `npm run build` passed
  - **Simulation** (AR backend + Vite + put API + Chrome DevTools screenshots):
    - mission live → after the last frame, the backend logged "No game frames for 34s; expiring mission 'Sim Op' on 'Stratis'", and the UI returned to the welcome screen
    - backend stopped while the page stayed open (no reload) → the header showed "Disconnected" within 10 s (previously only after all reconnect attempts, about 40 s or more)
    - A first attempt with a page reload didn't prove anything; redone with the page kept open.
  - First expiry test showed "Loading world data…" with zero counters on the welcome screen. Fixed by resetting the export status and draining the queued requests on expiry.
  - **Test PBO**: `pack-pbo.ps1` → `athena.pbo` (73.7 KB, prefix `athena`) containing the guard and the new message. It's unsigned; signing (DSSignFile, owner's private key) is needed for servers that verify signatures.

### 2026-11-22 — Version 1.2.0 (in development) + build label on test builds
- PR #2 (shared UI core) merged by the owner as `c1a790e`; branch deleted.
- **Test build for the owner**, built from `main` with `publish.ps1`:
  - first run of `publish.ps1` on the flattened layout: OK, 105.8 MB EXE; it skips the 2 non-existent wwwroot targets
  - smoke test: serves the new UI, SignalR negotiate 200
  - copied to `D:\AthenaRemastered-test\` (SHA256 `882C1830…`) with `TEST-INSTRUCTIONS.txt`
  - restored the tracked `@AthenaRemastered/Server/wwwroot` afterwards
- Owner feedback: the test build said **v1.1.6**, the same as the Workshop version. Owner decisions: version **1.2.0**, and all test builds show **version + test + commit** as standard, in both apps.
  - The owner's screenshot also showed "Disconnected / Connecting to server…"; asked whether it persists during a mission.
- Changes (branch `chore/version-1.2.0-build-label`):
  - Version 1.2.0 in all checklist files: `Frontend/src/version.ts`, `Frontend/package.json` (+ lock via `npm version`), `Backend/AthenaRemastered.Server.csproj`, `Extension/config.h`, `@AthenaRemastered/mod.cpp`. The DLL binary is not rebuilt yet (the shipped DLL is still 1.1.6).
  - `CHANGELOG.md`: `[1.2.0] - Unreleased` entry with a BattlEye Status section.
  - Build label: `Frontend/vite.config.ts` and new `Frontend/src/build-info.d.ts` copied from Web2 (identical); `appConfig.ts` exports `APP_BUILD` and `APP_BUILD_DATE`. Core re-synced from Web2 `a6f63ae` (`core/utils/version.ts`, `SidebarHeader`, `Sidebar` footer).
  - `publish.ps1`: new `-Release` switch (`ATHENA_RELEASE=1`); the default is a test build.
  - `CLAUDE.md` release checklist updated.
- Owner observation: **the UI stays "active" when the game or the server closes.** Causes (code reading):
  - server closes: `adapter/useAthenaHub.ts` sets `connected=false` only in `onclose`, which `withAutomaticReconnect()` fires only after all retries fail. There's no `onreconnecting` handler, so the UI keeps "Connected" and shows stale data.
  - game closes, server keeps running: the backend never clears the mission (no staleness timeout like Web2's live-world expiry), so `frame.mission` stays set and the UI stays live.
  - Added to the backlog. The "Disconnected" status in the owner's screenshot is still unclear; owner will check later.

### 2026-11-22 — Frontend: adopt the shared UI core from Athena Web 2 (Phase 2 step 2)
- PR #1 (layout flatten + process files) merged by the owner as `b640b5d`. Local `main` updated, branch deleted. New branch `feat/adopt-shared-core`.
- **Core copied** with Web2's `scripts/sync-core-to-ar.ps1` into `Frontend/src/core/`, with a manifest `core-manifest.json` (current source: Web2 commit `6476a24`). Re-syncs on this branch (after the Web2 fixes below) updated only the changed files (2, then 1), and the drift check passed (no hand edits in AR's core).
- **AR-specific files:**
  - `Frontend/src/appConfig.ts`: `API_BASE` (backend :5000), name/version from `version.ts`, `DONATE_URL` = PayPal.Me (the old `donate/?business=` link fails for this account), and `MAP_DATA` (same endpoints, `landmaskGridSize` 1024, **`landmaskRowOrder: 'north-first'`** because `StaticMapController` returns row 0 = north)
  - `CAPABILITIES`: lazes/projectiles/killFeed/waypointToggle on; relayMarkers and worldPicker off
  - `Frontend/src/adapter/useAthenaHub.ts`: AR's SignalR hook moved here (`git mv`); imports point at `core/types/game` and `appConfig`
  - `Frontend/src/extensions/projectileTracking.tsx` (new):
    - `ProjectileTrackingLayers` (laze + projectile prediction into the core's `athena-laze` / `athena-projectile` panes via `mapExtensions`)
    - `FireControlPanel` (`overlayExtensions`)
    - `useRecentShooterIds` (`pulseUnitIds`, `FIRING_PULSE_WINDOW_MS = 2200`)
    - Behaviour ported unchanged from AR's map code (via Web2 commit `966b6bc`) by a one-off assembly script (scratchpad, not committed). Known projectile bugs are kept for the v2 redesign.
  - `Frontend/src/App.tsx` rewritten as the AR composition: core + adapter + extension + `EventFeed` (right panel below the I-TGT panel).
    - **The map now only shows the world of a live mission** (`frame.mission`). The welcome screen shows until then, which fixes the visible part of "Malden shown while Arma is in the main menu". The backend still auto-loads the last world; that backend fix is separate.
- **Removed (superseded by the core):** `components/AthenaMap.tsx`, `components/Sidebar.tsx`, `hooks/useStaticMap.ts`, `hooks/useAthenaLibrary.ts`, `types/game.ts`, `App.css` (it had no selectors that aren't in `core/styles/app.css`).
- **Core gaps found and fixed in Web2** (one-way rule), then re-synced:
  - the core sidebar showed Web2's offline world picker ("select a map / use Athena Desktop") → new `CAPABILITIES.worldPicker` (AR: off, shows "Waiting for a mission")
  - AR's `/api/game/trees` returns **204 No Content** when empty, and the core parsed it as JSON → now treated as "no trees"
- Validation:
  - `npm run build` passed
  - **Live simulation without Arma**: AR backend (`dotnet run`, :5000) + Vite (:5174), game data sent through the real `POST /api/game/put` API (mission "Sim Op" on Stratis, world, time, group, unit with an active laser, a mortar `fired`). Screenshot through a Chrome DevTools script (scratchpad), because headless `--screenshot` captured at ~0.5 s; SignalR keeps the network busy, so `--virtual-time-budget` never settles.
  - Result:
    - welcome screen without a mission
    - with the mission: Connected, live Stratis, laze marker, projectile track "LASE ETA 16s", Fire Control row, Recent Shots in EVENTS, I-TGT panel, collapse buttons, AR toggles (Waypoints / Active Lazes / Projectile Tracking), no marker toggles
    - only remaining console output: the expected warning "No runtime tree data returned for Stratis"
  - ESLint (non-core files): 2 × `react-hooks/set-state-in-effect` in `App.tsx` (same pattern as Web2) and 1 × `react-refresh/only-export-components` in `extensions/projectileTracking.tsx` (hook and components in one file; affects dev hot reload only).
  - Not tested yet: live Arma with the real DLL and Athena Desktop terrain (no Arma on this machine). The owner should test before merge.
- Line endings: Git for Windows (`core.autocrlf`) warned "LF will be replaced by CRLF" on the copied core files. The sync manifest hashed raw bytes, so later checkouts would have flagged every core file as "modified in AR".
  - Fixed in Web2's sync script (`5a1c226`: CRLF→LF normalised hashing).
  - Re-ran with `-Force` to rewrite `core-manifest.json`: the old manifest flagged all 17 files (the false positive), **0 files were copied** (content identical), and only the manifest changed.
- Owner approved push + PR. Opened **PR #2** https://github.com/SgtFoose/AthenaRemastered/pull/2. It depends on Web2 PR #6, and should only be merged after the owner's live Arma test (rendering on a cached map, lazes/projectiles as before, collapsible menus, I-TGT, welcome screen in the main menu).

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
- [x] Adopt the shared UI core from Web2 with an AR adapter (SignalR) and `appConfig` (`landmaskRowOrder: 'north-first'`) (branch `feat/adopt-shared-core`, pending the owner's live test).
- [ ] Steam Workshop pages: align AR and Web2. Names differ ("Athena Remastered" vs "@AthenaWeb2"), Web2's tags are odd (Animation, Editor Extension, Equipment, Terrain; AR: Mechanics), and the description styles differ. Owner request 2026-11-22, screenshots from Arma 3 Publisher.
- [ ] Optional: offline world picker for AR (`CAPABILITIES.worldPicker`) over AR's cached worlds.
- [ ] Split `useRecentShooterIds` out of `extensions/projectileTracking.tsx` (react-refresh lint).
- [x] (2026-11-22, branch `fix/backend-startup-export-stale`) UI goes back to the welcome/disconnected state when the server or game stops:
  - frontend: handle SignalR `onreconnecting` → `connected=false`, `onreconnected` → true
  - backend: expire the live mission after N seconds without frames (like Web2's live-world timeout) and broadcast it
- [x] Backend: drop the startup world auto-load (2026-11-22).
- [~] SQF: main-menu guard in `init.sqf` (2026-11-22, is3DEN + findDisplay 0; verify live via the RPT).
- [x] Backend: skip the auto world export for cached worlds. It already did when MapCache was complete; the misleading "Rendering map" message was fixed (2026-11-22).
- [ ] Backend: forest cell size (16) + Y-flip fix (as in Web2's bridge).
- [ ] Projectile tracking v2 as an AR extension (fixes the MLRS/M4/mortar bugs).
- [ ] Turn `ATHENA_DEBUG_FIRED` off by default (it currently logs every tracked shell to the RPT).
- [ ] GitHub: branch ruleset like Web2, a release-notes template, tag `v1.1.6`, GitHub Releases.
- [ ] README/About in Web2's structure.
