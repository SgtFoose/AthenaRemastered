# Changelog

All notable changes to Athena Remastered will be documented in this file.

For each release, include a `### BattlEye Status` subsection with one of:
- `Registered` (allowlisted for the shipped DLL hash)
- `Pending` (submitted, waiting on BattlEye)
- `Not Submitted` (no submission yet)

## [Unreleased]

### Fixed
- Projectile heading for artillery/vehicle fire now uses turret-derived fire direction where available, preventing hull-direction drift in trajectory visuals
- Fired event direction payload is carried consistently from SQF through backend to frontend rendering
- CIV side filtering and color behavior in map/ORBAT views are now consistent
- Tree/object static map rendering was adjusted for orientation consistency and practical zoom visibility

## [1.1.6] — 2026-03-21

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
