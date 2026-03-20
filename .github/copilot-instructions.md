# Athena Remastered — Copilot Context

## Project Overview
A faithful remaster of Bus's original Athena Arma 3 second-screen application.
Three components: **Extension** (C++ DLL loaded by Arma 3) → **Backend** (ASP.NET Core 9) → **Frontend** (React 19 + Vite + Leaflet).

## Repository Layout
```
AthenaRemastered/
  Backend/            ASP.NET Core 9, port 5000
  Extension/          C++ DLL (AthenaServer_x64.dll), loaded by Arma 3
  Frontend/           React 19 + Vite 7, port 5173
  @AthenaRemastered/  Arma 3 mod folder (SQF source + DLL + PBO)
```

## Data Flow
```
Arma 3  →  C++ Extension (callExtension)  →  Backend REST API (POST /api/game/put)  →  SignalR Hub  →  React Frontend
```

### Auto-Queue Chain
1. `put mission` → backend queues `"world"` request
2. DLL polls `GET /api/game/request` → sends to Arma → `monitorRequests.sqf` dispatches SQF
3. `put world` → stores `WorldInfo`, queues `"roads"`, `"forests"`, `"locations"`
4. Arma runs export SQFs → `put road`/`put forest`/`put location` → `put *complete` triggers SignalR broadcast

## Key Architecture Decisions

### Coordinate System
- Arma: `[X=East, Y=North]` in metres, origin at map SW corner
- Leaflet CRS.Simple, normalised 0–100 space: `scale = 100 / worldSize`
- Map position: `[leafletLat, leafletLng] = [posY * scale, posX * scale]`
- Y is NOT inverted — CRS.Simple with `[[0,0],[100,100]]` bounds, North is up

### SQF Argument Positions
| fn | Key args |
|----|---------|
| `world` | [0]=nameDisplay, [1]=nameWorld, [2]=author, [3]=sizeWorld, [22]=centerX, [23]=centerY |
| `road` | [1]=id, [2]=type, [3]=foot, [4]=bridge, [9]=beg1X, [10]=beg1Y, [12]=end2X, [13]=end2Y, [15]=dir, [16]=length, [17]=width |
| `forest` | [1]=**Y**, [2]=**X**, [3]=level (Y before X — note the swap!) |
| `location` | [0]=type(class), [2]=name(text), [3]=sizeX, [4]=sizeY, [5]=dir, [6]=posX, [7]=posY |

### Known DLL Fixes (applied)
1. **CRLF trim** in `LoadConfig()` — config parser left `\r` on values
2. **`StripArmaStr()`** in `json_builder.h` — Arma passes string args with surrounding double-quotes

## Backend Files
| File | Purpose |
|------|---------|
| `Controllers/GameController.cs` | `POST /api/game/put` from DLL; routes to GameStateService |
| `Controllers/StaticMapController.cs` | Serves pre-cached static map data (objects, trees, contours) |
| `Services/GameStateService.cs` | Thread-safe state store; auto-queues geometry exports |
| `Services/BroadcastService.cs` | Bridges state events to SignalR hub |
| `Services/MapCacheService.cs` | Disk cache for static map data per world |
| `Services/StaticAthenaCacheService.cs` | Reads Athena Desktop cache files (Objects.txt, Trees.txt, etc.) |
| `Hubs/AthenaHub.cs` | SignalR hub; sends stored geometry to freshly-connected clients |
| `Models/GameState.cs` | All C# model classes |

## Frontend Files
| File | Purpose |
|------|---------|
| `src/types/game.ts` | TypeScript interfaces mirroring all C# models |
| `src/hooks/useAthenaHub.ts` | SignalR connection; exposes frame/worldInfo/roads/forests/locations state |
| `src/hooks/useAthenaLibrary.ts` | Fetches vehicleClasses + locationClasses JSONs |
| `src/hooks/useStaticMap.ts` | Fetches pre-rendered static map layers |
| `src/App.tsx` | Root component; sidebar, donate link |
| `src/components/AthenaMap.tsx` | Leaflet map; renders all layers |
| `src/components/Sidebar.tsx` | MAP/ORBAT tabs, layer toggles, location list |
| `src/components/EventFeed.tsx` | Kill/shot event feed panel |

## SignalR Events (hub → frontend)
| Event | Payload | Trigger |
|-------|---------|---------|
| `Frame` | `GameFrame` | Every `put updateend` |
| `WorldInfo` | `WorldInfo` | `put world` received |
| `Roads` | `Road[]` | `put roadscomplete` |
| `Forests` | `ForestsData` | `put forestscomplete` |
| `Locations` | `MapLocation[]` | `put locationscomplete` |
| `Fired` | `FiredEvent` | `put fired` |
| `Killed` | `KilledEvent` | `put killed` |

## Server Settings
- Settings come ONLY from Arma mission params (not browser-configurable)
- Flow: `description.ext` → SQF `BIS_fnc_getParamValue` → DLL `put settings` → Backend → SignalR → browsers (read-only)
- Model: `ServerSettings { showEast, showGuer, showCiv }`

## Steam Workshop
- **Workshop ID**: 3687225607
- **Workshop URL**: https://steamcommunity.com/sharedfiles/filedetails/?id=3687225607

## Published Mod Structure (`@AthenaRemastered/`)
```
@AthenaRemastered/
  addons/athena.pbo              Signed PBO (SQF scripts + config)
  addons/athena.pbo.*.bisign     BIS signature
  keys/AthenaRemasteredKey.bikey Public key for server admins
  Server/AthenaRemastered.Server.exe  Self-contained backend + frontend
  Server/wwwroot/                Built React frontend
  AthenaServer_x64.dll           C++ extension DLL
  AthenaServerSettings.txt       DLL config (host/port)
  mod.cpp                        Arma launcher metadata
  meta.cpp                       Workshop metadata
```

## How to Run
```powershell
# One-click:
.\AthenaRemastered\launch.ps1

# Or manually:
cd AthenaRemastered/Backend; dotnet run -c Release
cd AthenaRemastered/Frontend; npm run dev
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- SignalR hub: ws://localhost:5000/hub
- Arma 3 launch: `-mod=@AthenaRemastered -filePatching`

## Debugging
- **RPT log**: `%LOCALAPPDATA%\Arma 3\Arma3_x64_*.rpt` — search `AthenaServer`
- **DLL location**: `@AthenaRemastered\AthenaServer_x64.dll`
- **Request queue empty + mission null** → DLL not calling extension; check RPT for `Loading extension`

## Static Data from Athena Desktop Cache
Pre-exported map data at `%USERPROFILE%\Documents\Athena\Maps\{worldName}\`:
- `Objects.txt`, `Trees.txt`, `Roads.txt`, `Forests.txt`, `Locations.txt`, `Map.txt`, `Height/Z*.txt`
- CanvasX = worldX, CanvasY = worldSize − worldY

## Release Checklist (MUST do every version bump)
When bumping the version for a release, **ALL** of the following files must be updated:

| File | What to change |
|------|---------------|
| `Frontend/src/version.ts` | `APP_VERSION = 'X.Y.Z'` |
| `Frontend/package.json` | `"version": "X.Y.Z"` |
| `Backend/AthenaRemastered.Server.csproj` | `<Version>X.Y.Z</Version>` |
| `Extension/config.h` | `#define ATHENA_VERSION "X.Y.Z"` |
| `@AthenaRemastered/mod.cpp` | `version`, `versionStr`, `versionAr[]` |
| `CHANGELOG.md` | New `## [X.Y.Z]` section at the top |

The server startup banner in `Program.cs` reads version from the assembly automatically — no manual change needed there.

After code changes:
1. `npm run build` in Frontend → copy `dist/*` to `publish/wwwroot/` and `@AthenaRemastered/Server/wwwroot/`
2. `dotnet publish -c Release -o ../publish` in Backend
3. Copy fresh `dist/*` again (dotnet publish may overwrite wwwroot)
4. Sign PBO if SQF changed (Addon Builder + DSSignFile)
5. If `AthenaServer_x64.dll` changed, run the BattlEye release gate in `docs/BATTLEYE_REGISTRATION_AND_RELEASE.md` before Workshop publish
6. Update Steam Workshop
7. Git commit & push
