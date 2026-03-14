# ⬡ Athena Remastered

**A faithful remaster of Bus's original Athena — a real-time second-screen tactical map for Arma 3.**

Athena Remastered is a Blue-Force Tracker that streams your Arma 3 mission to a second screen — tablet, phone, or any browser on your local network. It renders live unit positions, vehicles, groups, terrain, and events directly from the game engine.

![Athena Remastered](Athena%20Remastered%20UI%20v0.1.0%20alpha.png)

---

## What It Does

Athena Remastered runs alongside Arma 3 and provides a real-time tactical overview:

- **Live tracking** of all friendly units, vehicles, and groups on an interactive map
- **Full terrain rendering** — roads, forests, coastlines, contour lines, buildings, and named locations are all exported from the game and drawn as vector layers
- **Multiple map styles** — switch between 2D Topographic, Ground Heatmap, and Pilot Heatmap views
- **NATO APP-6 symbology** — group markers with proper echelon indicators
- **Vehicle recognition** — distinct icons per vehicle category (tanks, APCs, helicopters, planes, boats, artillery, drones, etc.)
- **Role-specific unit icons** — infantry, medic, officer, engineer, recon, MG, AT, and more
- **Event feed** — real-time kill feed and shot tracking
- **ORBAT panel** — Order of Battle view showing all groups organized by faction
- **Multi-device support** — connect multiple browsers/tablets to a single session
- **Server admin controls** — mission makers can toggle visibility of EAST/GUER/CIV sides

## How It Works

```
Arma 3  →  C++ Extension (DLL)  →  ASP.NET Core Backend  →  React Frontend (Browser)
           AthenaServer_x64.dll     localhost:5000             localhost:5173
```

| Component | Technology | What it does |
|-----------|-----------|--------------|
| **Extension** | C++ DLL | Loaded by Arma 3 via `callExtension`, extracts game state every frame |
| **Backend** | ASP.NET Core 9 | REST API receives data from the DLL, stores state, broadcasts via SignalR |
| **Frontend** | React 19 + Vite + Leaflet | Renders the interactive tactical map in any modern browser |

The DLL continuously sends game data (units, vehicles, groups, events) to the backend. The backend pushes updates to all connected browsers in real-time via SignalR (WebSockets). Map geometry (roads, forests, locations) is exported once per map and cached.

## Prerequisites

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
cd AthenaRemastered/Backend
dotnet run -c Release
```

The backend starts on `http://localhost:5000`.

### 3. Start the frontend

Open a second terminal:

```powershell
cd AthenaRemastered/Frontend
npm install
npm run dev
```

The frontend starts on `http://localhost:5173`.

> **Shortcut:** Run `.\AthenaRemastered\launch.ps1` to start both at once.

### 4. Set up the Arma 3 mod

1. Copy the `@AthenaRemastered` folder into your Arma 3 directory
2. Launch Arma 3 with: `-mod=@AthenaRemastered -filePatching`
3. Start or join a mission — Athena will begin streaming automatically

### 5. Open the map

- On the same PC: open `http://localhost:5173` in your browser
- On a tablet or phone on the same network: open `http://<your-pc-ip>:5173`
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

## Reporting Issues

- **Bug reports** — Open an issue on [GitHub Issues](https://github.com/SgtFoose/AthenaRemastered/issues) using the Bug Report template
- **Feature requests** — Open an issue using the Feature Request template

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
