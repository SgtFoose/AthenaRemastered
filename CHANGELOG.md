# Changelog

All notable changes to Athena Remastered will be documented in this file.

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
