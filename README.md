# ⬡ Athena Remastered

**A faithful remaster of Bus's original Athena — a real-time second-screen tactical map for Arma 3.**

[![Steam Workshop](https://img.shields.io/badge/Steam_Workshop-Subscribe-blue?logo=steam)](https://steamcommunity.com/sharedfiles/filedetails/?id=3687225607)

## Featured Video

<p align="center">
  <a href="https://www.youtube.com/watch?v=ptg3v0dg8vo">
    <img src="https://img.youtube.com/vi/ptg3v0dg8vo/maxresdefault.jpg" alt="Watch the latest Athena Remastered video on YouTube" width="960">
  </a>
</p>

<p align="center">
  <strong><a href="https://www.youtube.com/watch?v=ptg3v0dg8vo">Watch the latest Athena Remastered video on YouTube</a></strong><br/>
  Gameplay, features, and the newest Athena Remastered update in action.
</p>

## Latest Release

> **v1.2.1 (hotfix):** v1.2.0 did not start in missions. v1.2.1 fixes that, removes the FPS cost (live updates 4× per second, tested with 66 units and 15 vehicles), stops map exports from freezing the game, and makes projectile tracking work live on tablets. Do not load Bus's original Athena mod at the same time. See the [CHANGELOG](CHANGELOG.md).

### v1.2.0 — the classic Athena look, rebuilt

Athena Remastered v1.2.0 brings the map renderer of [Athena Web 2](https://github.com/SgtFoose/Athena-Web-2) to Athena Remastered. The map now looks like Bus's original Athena Desktop: the same colours, smoothed coastlines and contour lines, airport surfaces, individual trees, and the classic Athena vehicle silhouettes. Your units and groups sit on top with clear labels.

<p align="center">
  <img src="Images/Athena%20Remastered%20v1.2.0%20Map.jpg" alt="Athena Remastered v1.2.0 map of Malden around Blanches and La Rivière, with trees, roads, buildings and labelled units" width="420">
  &nbsp;
  <img src="Images/Athena%20Remastered%20v1.2.0%20Laser%20Projectile%20Tracking.jpg" alt="Athena Remastered v1.2.0 projectile tracking: a laser-guided shot from Saint Martin with its live LASE ETA label" width="420">
</p>
<p align="center"><em>Left: the new map look on Malden. Right: a laser-guided shot tracked live from the battery at Saint Martin to the laser spot, with a counting-down ETA.</em></p>

**What's new**
- **Classic Athena map** — Athena Desktop colours, smoothed coastlines and contours, airport surfaces, trees and vehicle silhouettes
- **I-TGT target capture** — press **T** or the middle mouse button (**SAVE TGT** on a tablet) to store a map position as a target
- **Made for tablets** — collapsible sidebars and a layout that works on a phone or tablet next to your keyboard
- **Maps stay exported** — exported maps live in `Documents\AthenaRemastered\MapCache`, so an update no longer means exporting every map again
- **Accurate forests** — with an Athena Desktop export the forest overlay matches Athena Desktop and Athena Web 2 exactly
- **Fixes** — one Recent Shots entry per shot, real crew seats (D: / G: / C:), no map in the main menu or editor, and impact tracking for the M5 Sandstorm and other artillery

Get it from the [Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3687225607) or the [GitHub Releases](https://github.com/SgtFoose/AthenaRemastered/releases) page. Full details are in the [CHANGELOG](CHANGELOG.md).

Athena Remastered is a real-time tactical tracker that streams your Arma 3 mission to a second screen — tablet, phone, or any browser on your local network. It renders live unit positions, vehicles, groups, terrain, and events across all visible sides directly from the game engine.

<details>
<summary>Screenshots from v1.1.6 (Active Lazes, Projectile Tracking, map styles)</summary>

See also the [v1.1.6 feature overview](docs/v1.1.6-preview.md).

![Athena Remastered Active Lazes and Projectile Tracking](Images/Athena%20Remastered%20Active%20Lazes%20and%20Projectile%20Tracking.png)
![Athena Remastered Active Lazes and Projectile Tracking 2](Images/Athena%20Remastered%20Active%20Lazes%20and%20Projectile%20Tracking%202.png)
![Athena Remastered Active Lazes](Images/Athena%20Remastered%20Active%20Lazes.png)
![Athena Remastered Forest Overlay](Images/Athena%20Remastered%20Forest%20Overlay.png)
![Athena Remastered Trees Render](Images/Athena%20Remastered%20Trees%20Render.png)
![Athena Remastered Map Style Ground](Images/Athena%20Remastered%20Map%20Style%20Ground.png)
![Athena Remastered Map Style Pilot](Images/Athena%20Remastered%20Map%20Style%20Pilot.png)
![Athena Remastered Mouse Coordinates](Images/Athena%20Remastered%20Mouse%20Coordinates.png)
![Athena Remastered Objects Rendering](Images/Athena%20Remastered%20Objects%20Rendering.png)

</details>

## Migration Status

Athena Remastered is currently migrating away from `AthenaServer_x64.dll` to a script-first pipeline:

- **Current stable release:** uses the DLL extension path
- **In-progress migration:** SQF scheduled exports + external companion bridge service (no Arma DLL dependency)

During migration, documentation and release notes explicitly state whether a build is **DLL-based** or **DLL-free**.

![Athena Remastered](Images/Athena%20Remastered%20Splash%201.png)

![Athena Remastered Map](Images/Athena%20Remastered.png)

---

## What It Does

Athena Remastered runs alongside Arma 3 and provides a real-time tactical overview:

- **Live tracking** of all visible units, vehicles, and groups across WEST/EAST/GUER/CIV on an interactive map
- **Full terrain rendering** — roads, forests, coastlines, contour lines, buildings, and named locations are all exported from the game and drawn as vector layers
- **Multiple map styles** — switch between 2D Topographic, Ground Heatmap, and Pilot Heatmap views
- **NATO APP-6 symbology** — group markers with proper echelon indicators
- **Vehicle recognition** — distinct icons per vehicle category (tanks, APCs, helicopters, planes, boats, artillery, drones, etc.)
- **Role-specific unit icons** — infantry, medic, officer, engineer, recon, MG, AT, and more
- **Active Lazes** — live laser designation points rendered directly on the map
- **Projectile Tracking** — predicted missile, rocket, artillery, and cruise-weapon paths with ETA labels
- **Who's Shooting** — units blink when firing so you can instantly see who is actively shooting
- **Event feed** — real-time kill feed and shot tracking
- **ORBAT panel** — Order of Battle view showing all groups organized by faction
- **Multi-device support** — connect multiple browsers/tablets to a single session
- **Server admin controls** — mission makers can toggle visibility of EAST/GUER/CIV sides

## How It Works

```
Arma 3 SQF  →  Log/Telemetry Output  →  Athena Bridge Service  →  ASP.NET Core Backend  →  React Frontend
```

| Component | Technology | What it does |
|-----------|-----------|--------------|
| **Extension (current)** | C++ DLL | Loaded by Arma 3 via `callExtension`, extracts game state and forwards to backend |
| **Backend** | ASP.NET Core 9 | REST API receives data from extension, stores state, broadcasts via SignalR |
| **Frontend** | React 19 + Vite + Leaflet | Renders the interactive tactical map in any modern browser |
| **Future: In-Game Export** | SQF scripts | (Planned) Collects frame/events/world data on a schedule and emits structured telemetry |
| **Future: Bridge** | External companion process | (Planned) Reads emitted telemetry, normalizes payloads, forwards to backend API |

The SQF pipeline emits game data (units, vehicles, groups, events) to an external bridge process. The backend pushes updates to all connected browsers in real-time via SignalR (WebSockets). Map geometry (roads, forests, locations) is exported once per map and cached.

## Quick Start (Steam Workshop)

The easiest way to get started:

1. Subscribe to [**Athena Remastered** on Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3687225607)
2. Open the server folder: `C:\Program Files (x86)\Steam\steamapps\common\Arma 3\!Workshop\@Athena Remastered\Server`
3. Run `AthenaRemastered.Server.exe` — this starts the backend and serves the frontend
4. Open `http://localhost:5000` in your browser
5. Launch Arma 3 with the mod enabled (via Arma 3 Launcher or `-mod=@AthenaRemastered`)
6. Start a mission — the map will populate automatically

> **BattlEye Status (v1.2.0):** the extension DLL is not allowlisted (unchanged since v1.1.5). DLL-based sessions require `-noBE` for singleplayer/LAN.
>
> **In singleplayer/LAN:** Launch with `-noBE` to disable BattlEye for development and testing.
>
> **Future:** A DLL-free pipeline (SQF + external bridge) is planned to eliminate this dependency entirely.

If you do not see the `!Workshop` folder in File Explorer, Windows is hiding it:

1. Open File Explorer
2. On Windows 11: select `View` -> `Show` -> `Hidden items`
3. On Windows 10: select `View` -> check `Hidden items`
4. If it still does not appear, open `View` -> `Options` -> `View`, then enable `Show hidden files, folders, and drives`

The server EXE is fully self-contained (no .NET runtime or Node.js needed). On other devices on your network, open `http://<your-pc-ip>:5000`.

### Alternative: GitHub Release (without Workshop)

1. Download `AthenaRemastered-v<version>.zip` from the [Releases](https://github.com/SgtFoose/AthenaRemastered/releases) page, unblock it (Properties → Unblock) and extract it
2. Move the `@AthenaRemastered` folder (mod + `Server\`) into your Arma 3 directory and add it in the Launcher via **Mods → Add local mod...** (or `-mod=@AthenaRemastered`)
3. Run `@AthenaRemastered\Server\AthenaRemastered.Server.exe`, open `http://localhost:5000`, launch Arma 3 with `-noBE`

---

## Development Setup

If you want to build from source or contribute, follow the steps below.

### Prerequisites

- [.NET 9 SDK](https://dotnet.microsoft.com/download/dotnet/9.0)
- [Node.js 20+](https://nodejs.org/)
- Arma 3 (Steam)

## Installation & Setup

### 1. Clone the repository

```
git clone https://github.com/SgtFoose/AthenaRemastered.git
```

### 2. Start the backend

```powershell
cd Backend
dotnet run -c Release
```

The backend starts on `http://localhost:5000`.

### 3. Start the frontend

Open a second terminal:

```powershell
cd Frontend
npm install
npm run dev
```

The frontend starts on `http://localhost:5173`.

> **Shortcut:** Run `.\launch.ps1` to start both at once.

### 4. Set up the Arma 3 mod

1. Copy the `@AthenaRemastered` folder into your Arma 3 directory
2. Launch Arma 3 with: `-mod=@AthenaRemastered -filePatching`
3. Start or join a mission — Athena will begin streaming automatically

If you are running a DLL-based build and see `BattlEye: Blocked loading of file ...\AthenaServer_x64.dll`, BattlEye is still blocking extension load for that launch profile.

### 5. Open the map

- For the manual development flow above (`npm run dev`): open `http://localhost:5173` in your browser
- For the packaged/server EXE flow: open `http://localhost:5000` on the same PC
- On a tablet or phone on the same network with the packaged/server EXE flow: open `http://<your-pc-ip>:5000`
  - Find your IP with `ipconfig` in PowerShell

Multiple devices can connect simultaneously and will all show the same live view.

## Using the Map

| Control | Action |
|---------|--------|
| **Scroll wheel** | Zoom in/out |
| **Click & drag** | Pan the map |
| **Zoom slider** | Vertical slider on the left edge |
| **MAP tab** | Toggle map layers (roads, contours, locations, groups, vehicles, units) and switch render style |
| **ORBAT tab** | View Order of Battle — all groups and units organized by faction |
| **Click a location** (sidebar) | Pan the map to that location |
| **Click a group/unit** (ORBAT) | Pan the map to that group or unit |

At low zoom levels, only group markers are shown. Zoom in past ~2× to see individual units and vehicles.

## Repository Structure

```
AthenaRemastered/
  @AthenaRemastered/    Arma 3 mod folder (SQF scripts, config, DLL)
  Backend/              ASP.NET Core 9 web server (REST API + SignalR)
  Extension/            C++ DLL source code
  Frontend/             React + Vite + Leaflet UI
  launch.ps1            One-click launcher (backend + frontend)
  publish.ps1           Publish script for deployment
```

## Version History

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

## Next Release Preview

Follow current work for the upcoming version here:

- [v1.1.6 Preview](docs/v1.1.6-preview.md)

## Reporting Issues

- **Bug reports** — Open an issue on [GitHub Issues](https://github.com/SgtFoose/AthenaRemastered/issues) using the Bug Report template
- **Feature requests** — Open an issue using the Feature Request template

## Troubleshooting

- **Error:** `BattlEye: Blocked loading of file ...\AthenaServer_x64.dll`
- **Cause:** BattlEye blocks unregistered Arma extension DLLs. Athena v1.1.6 still requires a fresh allowlist approval for the shipped DLL build.
- **Workaround (now):** Launch Arma with `-noBE` to disable BattlEye for LAN/singleplayer sessions.
- **Planned (future):** Use the DLL-free architecture (SQF scheduled export + external bridge); no Arma extension dependency.
- **Release gate:** See [docs/BATTLEYE_REGISTRATION_AND_RELEASE.md](docs/BATTLEYE_REGISTRATION_AND_RELEASE.md) for submission details and release process.

## Tester Guide: RPT and Publish

### Find and use the Arma RPT log

When testing Athena in Arma, the RPT is the first place to confirm extension load and export flow.

1. RPT location:
  - %LOCALAPPDATA%\Arma 3\Arma3_x64_*.rpt
2. Open the newest Arma3_x64_*.rpt after launching the game.
3. Search for AthenaServer entries to verify startup and request handling.
4. Confirm sequence during mission start:
  - extension load message
  - mission/world export messages
  - request queue activity (roads/forests/locations)

If map data is missing, attach the latest RPT segment around AthenaServer lines when reporting an issue.

### Publish flow for testers (local release validation)

Use this flow to validate a release package before manual Workshop publishing.

1. Build and stage frontend/backend:

```powershell
cd AthenaRemastered
.\publish.ps1
```

2. Rebuild PBO and sign with Arma tools:
  - Build addon PBO with Addon Builder
  - Sign each PBO with the project key so every .pbo has a matching .bisign
3. Validate addon folder content before upload:
  - athena.pbo and athena.fixed.pbo are present
  - both have matching .bisign files
4. Copy/sync outputs to the mod distribution folder:
  - @AthenaRemastered\addons
  - @AthenaRemastered\Server\wwwroot
5. Run Publisher upload manually after signatures and file sync are confirmed.

## Links

- [**Steam Workshop**](https://steamcommunity.com/sharedfiles/filedetails/?id=3687225607)
- [**GitHub Repository**](https://github.com/SgtFoose/AthenaRemastered)
- [**GitHub Issues**](https://github.com/SgtFoose/AthenaRemastered/issues)

## Credits

- **Original Athena** — Created by **Bus** ([YouTube](https://www.youtube.com/channel/UCwKPaREEkjSFh7l2n3s10Sw))
- **Athena Remastered** — Developed by **SgtFoose**

---

## ⚠️ Disclaimer & License

**This software is NOT open source.** All rights reserved. See [LICENSE](LICENSE) for full terms.

This project is a remaster of Bus's original Athena application for Arma 3. It is published here for **testing and evaluation purposes only**.

**You may NOT:**
- Copy, redistribute, or share this software in any form
- Create derivative works or modifications without written permission
- Use this software for any commercial purpose
- Run this mod on Arma 3 multiplayer servers without authorization from SgtFoose

The author (SgtFoose) intends to contact the original creator (Bus) to obtain formal permission for this remaster. Until that process is complete, all rights are reserved.

If you are Bus or a representative of the original Athena project, please reach out via [GitHub Issues](https://github.com/SgtFoose/AthenaRemastered/issues).

This software is provided "AS IS", without warranty of any kind. Use at your own risk.
