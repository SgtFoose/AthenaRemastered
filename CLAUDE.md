# CLAUDE.md — Athena Remastered

Canonical project context for Claude Code. Consolidated on 2026-11-22 from `.github/copilot-instructions.md`, `README.md`, `CHANGELOG.md` and `docs/`. For *process rules* this file wins. `WORKLOG.md` and `CHANGELOG.md` remain the source of truth for *history*.

---

## RULE #1 — Log every step in WORKLOG.md (non-negotiable)

Every step we take gets logged in `WORKLOG.md` **in the same working batch**: code change, investigation, build, release, doc edit, config change, failed attempt, decision.

- Add entries under `## Timeline`, **newest first**.
- Heading format: `### YYYY-MM-DD — <version or area>: <short title>`.
- Body: bullets covering **what** changed, **why**, **which files** (backtick paths), and **validation** (commands run + results, including failures).
- Investigations that didn't pan out are logged too.
- Open problems: record exact repro steps (map, coordinates, weapon, mission) and keep the backlog at the bottom of `WORKLOG.md` current.

## RULE #2 — Everything in the repo is in English (non-negotiable)

The owner usually types in **Dutch**. The conversation may be in Dutch, but **everything written into the repository is English**: code, identifiers, comments, logs, UI text, commit messages, PR descriptions, release notes, docs and file names.

## RULE #3 — Write for collaborators: comment the code well (non-negotiable)

- **File/module header:** what the file is responsible for and where it sits in the SQF → DLL → backend → frontend pipeline.
- **Functions:** a doc comment (JSDoc/TSDoc, `///` XML docs in C#, a header comment in SQF and C++) with purpose, parameters, return value and side effects.
- **Non-obvious logic:** explain the *why*: SQF argument positions, coordinate transforms, Arma quirks, DLL protocol details, calibration constants (with their source).
- **Magic numbers:** named constants with origin and units.
- When editing existing uncommented code, add comments to the parts we touched. Keep comments accurate.

## RULE #4 — GitHub account separation (critical)

This repo belongs to the owner's **personal** GitHub account **`SgtFoose`**, not the work account that also exists on this machine.

- Commit identity is pinned in the repo-local git config: `user.name = Sgt.Foose`, `user.email = 17387175+SgtFoose@users.noreply.github.com`, `credential.username = SgtFoose`.
- Before every commit, check `git config user.email`. Never override the author.
- Before every push, release or GitHub API call: confirm with the owner and make sure the authenticated account is `SgtFoose`. If anything looks off, stop and ask.
- Never write the work email, the work account name or other work details into any repo file, commit or release note.

---

## Project overview

Athena Remastered (**AR**, `v1.x`) is a remaster of Bus's original Athena Arma 3 second-screen application. It has three components: **Extension** (C++ DLL loaded by Arma 3), **Backend** (ASP.NET Core 9 + SignalR) and **Frontend** (React 19 + Vite + Leaflet).

```
Arma 3 SQF → C++ Extension (callExtension) → Backend REST (POST /api/game/put) → SignalR hub (/hub) → React frontend
```

- **BattlEye:** the custom `AthenaServer_x64.dll` is **not** BattlEye-approved. AR therefore runs only locally or on servers without BattlEye (`-noBE`). See `docs/BATTLEYE_REGISTRATION_AND_RELEASE.md`.
- **Because of the DLL, AR can do more than Athena Web 2:** active lazes, projectile tracking, killed/fired events, server settings.
- Current version: **v1.1.6** (2026-03-21). Workshop id `3687225607`.

## Relationship with Athena Web 2 (Web2)

- Web2 (https://github.com/SgtFoose/Athena-Web-2, local `C:\Athena-Web-2`, `v0.x`) is a separate product. It is client-only: Bus's original relay, no custom DLL, BattlEye-safe.
- **Shared UI core, one-way sync Web2 → AR.** Web2's `ui/src/core/` (map rendering, sidebar, app shell, I-TGT, welcome screen) is the canonical shared UI and gets copied **into** AR. Never copy AR code into Web2's core. The full plan, appConfig contract and capabilities are in Web2's `docs/ui-core-sync.md`.
- **AR-only features live here, in AR:** lazes, projectile tracking, Fire Control, the kill/shot feed. They plug into the shared core through its extension slots (`mapExtensions`, `overlayExtensions`, `pulseUnitIds`, panes `athena-laze` / `athena-projectile`).
- Don't add Web2 artifacts here (`bridge/`, Web2 docs, `0.x` versions).

## Repository layout (flattened 2026-11-22)

```
Backend/              ASP.NET Core 9 server, port 5000 (REST + SignalR /hub, serves wwwroot)
Extension/            C++ DLL source (AthenaServer_x64.dll), CMake
Frontend/             React 19 + Vite 7 UI, dev port 5173
@AthenaRemastered/    Arma 3 mod folder: addons/athena (SQF source), keys/, Server/wwwroot (built UI), mod.cpp, meta.cpp
tools/                helper scripts (e.g. Get-AthenaDllMetadata.ps1)
keys/                 public signing key material
docs/                 BattlEye registration/release docs, TODO, previews
Images/               README screenshots
launch.ps1            start backend + frontend for development
publish.ps1           build the self-contained server + copy the UI into the wwwroot targets
pack-pbo.ps1          pack an addon folder into a PBO
Athena Remastered.sln solution (Backend project)
```

Until 2026-11-22 everything above lived under a nested `AthenaRemastered/` folder, with a duplicate partial `@AthenaRemastered/` at the root. Older docs and commits refer to that layout.

## Commands

```powershell
.\launch.ps1                                   # backend + frontend for development
cd Backend;  dotnet run -c Release             # http://localhost:5000 (needs .NET 9 SDK)
cd Frontend; npm ci; npm run dev               # http://localhost:5173
.\publish.ps1                                  # self-contained server exe + UI copies
```

Arma launch: `-mod=@AthenaRemastered -filePatching -noBE`.

## Data flow details

**Auto-queue chain:**
1. `put mission` → the backend queues `"world"`.
2. The DLL polls `GET /api/game/request` and passes the request to Arma, where `monitorRequests.sqf` dispatches it.
3. `put world` → the backend queues `roads` / `forests` / `locations`.
4. `put *complete` → SignalR broadcast.

**Coordinates:** Arma `[X=East, Y=North]` in metres, origin SW. Leaflet `CRS.Simple`, normalised 0–100: `[lat, lng] = [posY * scale, posX * scale]`, `scale = 100 / worldSize`.

**SQF argument positions** (`put <fn>`):

| fn | Key arguments |
|---|---|
| `world` | [0] nameDisplay, [1] nameWorld, [2] author, [3] sizeWorld, [22] centerX, [23] centerY |
| `road` | [1] id, [2] type, [3] foot, [4] bridge, [9] beg1X, [10] beg1Y, [12] end2X, [13] end2Y, [15] dir, [16] length, [17] width |
| `forest` | [1] **Y**, [2] **X**, [3] level (Y before X) |
| `location` | [0] type, [2] name, [3] sizeX, [4] sizeY, [5] dir, [6] posX, [7] posY |

**SignalR events:** `Frame`, `WorldInfo`, `Roads`, `Forests`, `Locations`, `Structures`, `Elevations`, `ServerSettings`, `ExportStatus`, `Fired`, `FiredImpact`, `Killed`.

**Known DLL fixes already applied:** CRLF trim in `LoadConfig()`; `StripArmaStr()` in `json_builder.h`.

**Server settings** come only from mission params: `description.ext` → `BIS_fnc_getParamValue` → `put settings` → backend → SignalR (read-only in the browser).

**Athena Desktop cache:** `%USERPROFILE%\Documents\Athena\Maps\{world}\`, files `Objects.txt`, `Trees.txt`, `Roads.txt`, `Forests.txt`, `Locations.txt`, `Map.txt`, `Height/Z*.txt`. CanvasX = worldX, CanvasY = worldSize − worldY.

**Debugging:** RPT at `%LOCALAPPDATA%\Arma 3\Arma3_x64_*.rpt`. Search `AthenaServer`, `Athena Init:`, `Athena Queue:`, `ATHENA_IMPACTDBG` (projectile impact tracker; on by default via `ATHENA_DEBUG_FIRED`).

## Release checklist (every version bump)

1. **Versions:** `Frontend/src/version.ts`, `Frontend/package.json`, `Backend/AthenaRemastered.Server.csproj` (`<Version>`), `Extension/config.h` (`ATHENA_VERSION`), `@AthenaRemastered/mod.cpp` (`version`, `versionStr`, `versionAr[]`), and a new `CHANGELOG.md` entry with a `### BattlEye Status` subsection.
2. **Build:** run `.\publish.ps1 -Release` for releases (builds the UI, publishes the server and copies the UI into the wwwroot targets). Sign the PBO if SQF changed.
   - Plain `.\publish.ps1` makes a **test build**. The UI then shows `v<version>-test (<git sha>[-dirty])`, with the build time on hover. Test builds handed to the owner are always test builds, and should be built from a committed tree (no `-dirty`).
   - `Frontend/vite.config.ts` and `Frontend/src/build-info.d.ts` are identical to Athena Web 2's.
3. **BattlEye gate:** if `AthenaServer_x64.dll` changed, follow `docs/BATTLEYE_REGISTRATION_AND_RELEASE.md`.
4. **Publish:** Workshop update. GitHub Release with the server package (planned; AR has no releases yet), using an end-user release-notes template like Web2's.
5. Log everything in `WORKLOG.md`. Use the branch + PR workflow; the owner merges.

## Working rules

- **Branch + PR workflow:** never commit straight to `main`. Use one branch per task (`feat/`, `fix/`, `docs/`, `chore/`, `release/`) and Conventional Commit messages. The owner merges.
- Only commit, push or touch GitHub when the owner asks; confirm each remote operation.
- Never hardcode, print or commit tokens.

## Open items (verify against WORKLOG before acting)

See the backlog at the bottom of `WORKLOG.md` and Web2's `docs/ui-core-sync.md` ("AR-side fixes planned for Phase 2", "Design: AR projectile tracking v2").
