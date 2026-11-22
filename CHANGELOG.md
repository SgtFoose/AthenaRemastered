# Changelog

All notable changes to Athena Remastered will be documented in this file.

For each release, include a `### BattlEye Status` subsection with one of:
- `Registered` (allowlisted for the shipped DLL hash)
- `Pending` (submitted, waiting on BattlEye)
- `Not Submitted` (no submission yet)

## [1.2.1] - Unreleased (in development)

### Fixed
- **Athena did not start in missions (v1.2.0).** The main-menu check saw the main menu display still open while a mission was loading and stopped Athena in every mission. Athena now waits for the mission display, which only exists while a mission is played.
- FPS loss during missions: live position updates ran on every frame, with one blocking call to the server per unit and vehicle. They now run at most 4 times per second, like Bus's original relay. Mission makers can change the interval with `missionNamespace setVariable ["ATHENA_UPDATE_INTERVAL", <seconds>]`.
- The game froze while exporting a large map: the terrain-height export looped over every metre of the map to find a few thousand sample points. It now steps directly from sample to sample (same points).
- Per-shot debug logging (`ATHENA_DEBUG_FIRED`) is now off by default
- Tablets showed projectile tracks (and the Fire Control panel) late, never, or only after F5. Shot times now use the device's own receive time instead of the server clock, so a tablet clock that is a few seconds off no longer matters.
- The connection to the server now keeps retrying after an interruption (for example the tablet screen going off) and reconnects as soon as the page is visible again. Previously it gave up after a few attempts until F5.
- M5 Sandstorm rockets are now tracked to their impact point (the artillery check also looks at the weapon), so follow-up shots use the real impact point and time of flight

Thanks to Mrakos for the performance analysis on the Steam Workshop.

### BattlEye Status
- Not Submitted: `AthenaServer_x64.dll` unchanged

## [1.2.0] - 2026-11-22

### Added
- Shared UI core from Athena Web 2:
  - Web2 map rendering (Bus-exact colours, smoothed coastline/contours, airport surfaces, tree rings, Bus vehicle silhouettes)
  - collapsible sidebars and tablet layout
  - I-TGT target capture (T / middle click / SAVE TGT) with a target panel
  - follow-player auto-off on manual pan/zoom
- Test builds show their build in the UI (`v1.2.0-test (<commit>)`); release builds (`publish.ps1 -Release`) show only the version

### Changed
- The map only shows the world of a live mission; until then a welcome screen is shown (previously the last-used world appeared while Arma was still in the main menu)
- Donate link now opens PayPal.Me
- Kills / Recent Shots headers use flat line icons instead of emoji (the 🔫 rendered as a toy water pistol)
- Repository layout flattened (source folders at the repo root)
- The map cache moved to `Documents\AthenaRemastered\MapCache` (override: `ATHENA_MAPCACHE_DIR`), so a cached world is reused after updates, test builds or moving the server EXE. An existing `MapCache` folder next to the EXE is copied over automatically on first start.
- Every vehicle is drawn as a Bus silhouette, as in Athena Desktop (drones: plane icon; static weapons: mortar / AA / cannon / MG icons). The blue NATO frames used for drones, turrets, radars, MLRS and VLS are gone.
- The "Loaded from cache" / "Export complete" box disappears after 4 seconds; export progress stays visible

### Fixed
- Every shot appeared twice in "Recent Shots":
  - units carried both a `FiredMan` and a `Fired` handler, which report the same on-foot shot; units now get only `FiredMan`
  - the duplicate guard in `handleFired.sqf` used `exitWith` inside an `if` block, so it never stopped the second report
  - the server now also drops a repeated report of the same projectile
  - the same `exitWith` mistake meant out-of-range or behind-the-shooter targets were never rejected as projectile target candidates
- Crew labels showed "P:" for everyone: the extension sends the vehicle crew list as text, which the server ignored. Crew roles (D:/G:/C:) now reach the map. The DLL is unchanged.
- MLRS / artillery impact tracking: any weapon name containing "at" counted as guided, so the M5 Sandstorm's rockets never reported their impact point and time of flight. Guided and indirect fire are now detected from the ammo config.
- The version label in the sidebar header was cut off ("v1....")
- Forest overlay was far too dense: when Athena Desktop has exported the world (`Documents\Athena\Maps\<world>\Forests.txt`), AR now shows Bus's own 16 m forest cells (identical to Athena Web 2). Without that cache, AR's in-game sampling no longer counts a single tree within 75 m as forest (only the ≥5 / ≥15 tree levels are shown).
- Worlds were exported again after every server update or new install folder, because the cache lived next to the EXE
- Drones, static turrets, radars, Mk41 VLS and Mk45 Hammer no longer show as a large tilted rectangle

### Known Limitations
- Unguided artillery/rockets without a laze: the first shot of a fire mission is predicted at a fixed range along the fire direction. Later shots in the same direction use the real impact point and time. Projectile tracking v2 (real in-flight tracking) is planned.
- Map styles Ground and Pilot are being reworked (height map for ground troops / black-and-white height map for pilots)

### BattlEye Status
- Not Submitted: `AthenaServer_x64.dll` is unchanged since v1.1.5 (SHA256 `3DE7F325…1EE02`); use `-noBE` for singleplayer/LAN

## [1.1.6] — 2026-03-21

### Fixed
- Projectile heading for artillery/vehicle fire now uses turret-derived fire direction where available, preventing hull-direction drift in trajectory visuals
- Fired event direction payload is carried consistently from SQF through backend to frontend rendering
- CIV side filtering and color behavior in map/ORBAT views are now consistent
- Tree/object static map rendering was adjusted for orientation consistency and practical zoom visibility

### BattlEye Status
- Not Submitted: `AthenaServer_x64.dll` v1.1.6 requires a fresh allowlist submission if you ship a rebuilt DLL
- Workaround: Use `-noBE` for singleplayer/LAN on the current DLL-based path

### Added
- Active Laze markers on the live map so laser designation points are visible to connected clients in real time
- Projectile Tracking layer with predicted arcs and ETA labels for rockets, missiles, artillery, mortars, and cruise weapons

### Changed
- Fired events now carry target metadata from assigned targets, laser targets, and scanned laser objects to improve projectile prediction
- Vehicle-fired ordnance is captured more reliably through dedicated vehicle `Fired` handlers in addition to infantry events
- Release metadata, Workshop text, and README updated for v1.1.6

## [1.1.5] — 2026-03-21

### BattlEye Status
- Pending: Allowlist submission for `AthenaServer_x64.dll`
  - **DLL**: AthenaServer_x64.dll (v1.1.5 release bundle)
  - **SHA256**: `3DE7F325D7B75A8BB3665C97C8DABBC2C7FD409462071BCB69462D1137D1EE02`
  - **Size**: 279,552 bytes (0.267 MiB)
  - **FileVersion**: 1.1.4.0 (embedded in binary)
  - **ProductVersion**: 1.1.4.0 (embedded in binary)
  - **Status**: Submitted to support@battleye.com for allowlisting
  - **Workaround**: Use `-noBE` flag for singleplayer/LAN until approved

### Changed
- Kept the submitted `AthenaServer_x64.dll` binary unchanged to preserve BattlEye review hash integrity
- Updated Frontend, Backend, Extension, and mod configs to version 1.1.5
- Submitted DLL for BattlEye allowlisting with professional metadata

## [1.1.4] — 2026-03-20

### BattlEye Status
- Pending (allowlist not yet confirmed for `AthenaServer_x64.dll`)

### Changed
- All four sides (WEST, EAST, GUER, CIV) are now visible in the frontend by default — no mission params required
- Default unit export scope changed from 4 (Player Side only) to 16 (All Units across all sides)
- `ATH_showEast`, `ATH_showGuer`, `ATH_showCiv` mission params now **disable** a side when set to 0; omitting the param leaves the side visible
- Mission param classes are now checked for existence before reading, preventing false negatives when params are absent from `description.ext`

## [1.1.3] — 2026-03-20

### Fixed
- Published server now listens on the LAN by default, so tablets and phones on the same network can connect without additional binding changes
- Server startup output now reports usable local and LAN URLs instead of only `localhost`

### Changed
- Steam Workshop setup instructions now point users to the exact Workshop server folder and explain how to reveal the hidden `!Workshop` directory in File Explorer

## [1.1.2] — 2026-03-19

### Fixed
- Switching to a new map no longer renders Altis land/ocean as the base layer — stale contour data is now cleared immediately when the world changes
- Removed hardcoded "Altis" fallback world, preventing Altis terrain from eagerly loading before real game data arrives

## [1.1.1] — 2026-03-18

### Fixed
- Map change now properly clears stale geometry — switching worlds no longer bleeds old roads/forests/locations behind the new map
- Building footprints now render filled on all maps (previously only thin outlines visible without Athena Desktop cache)
- Map Style buttons (Ground/Pilot heatmap) now visually affect the map even when forest/tree/object layers are loaded — layers become semi-transparent so elevation colours show through
- Splash screen now shows live export progress counters (roads, forests, locations, structures, elevations) while the game exports terrain data
- Export phase set to "exporting" immediately on mission start — no gap between mission load and world data arrival

## [1.1.0] — 2026-03-18

### Added
- Welcome screen with default background image when no game data is connected
- Setup instructions shown on top of the map for new users
- Connection status indicator on welcome overlay

### Fixed
- Welcome overlay now correctly persists until a world is loaded (empty Frame no longer hides it)
- Server content root now uses EXE directory (`AppContext.BaseDirectory`) instead of CWD — server works regardless of launch directory
- PBO packaging: SQF scripts now correctly included (Addon Builder "copy directly" fix)
- Port references in README consolidated to port 5000 for production

## [1.0.0] — 2026-03-18

### Added
- Published to [Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3687225607)
- Self-contained `Server/AthenaRemastered.Server.exe` included in mod for easy setup
- BIS-signed PBO with public key for server verification
- Workshop metadata (`meta.cpp`)

## [0.1.0-alpha] — 2026-03-13

### Added
- Full Arma 3 → DLL → Backend → Frontend pipeline
- Real-time Blue-Force Tracker for WEST side units, vehicles, and groups
- Three map render modes: 2D Topographic, Ground Heatmap, Pilot Heatmap
- Terrain rendering: roads, forests, coastlines, contour lines, buildings
- Named location labels with zoom-appropriate sizing
- NATO APP-6 group markers with echelon indicators
- Role-specific unit icons (infantry, medic, HQ, engineer, recon, armor, etc.)
- Category-aware vehicle SVG icons (cars, APCs, tanks, helicopters, planes, boats, etc.)
- Mine/explosive warning markers
- Peak/summit triangle markers
- Event feed panel (kills and shots)
- Sidebar with MAP/ORBAT panels
- Server admin settings for side visibility
- Multi-device support via SignalR
- Vertical zoom slider with scale display
- Map layer toggles (contours, roads, locations, groups, vehicles, units)
- Donate link (PayPal)
- Version tracking

### Known Issues
- Runway/taxiway rendering may need further tuning
- Forest sample size may need adjustment per map
- Large maps may cause initial load delay
