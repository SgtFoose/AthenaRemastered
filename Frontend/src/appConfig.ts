/**
 * App-specific configuration for Athena Remastered.
 *
 * The shared UI core (`./core`, copied one-way from Athena Web 2; see Web2's
 * docs/ui-core-sync.md) reads every app-specific value from this module only.
 * Athena Web 2 has its own appConfig.ts with the same exports.
 */
import type { AppCapabilities, MapDataConfig } from './core/types/ui'
import { API_BASE } from './apiBase'

export { API_BASE }
export { APP_NAME, APP_VERSION } from './version'

/** Build label from vite.config.ts: "" for releases, "test (<sha>)" otherwise. */
export const APP_BUILD = __ATHENA_BUILD__
/** ISO-8601 UTC build timestamp from vite.config.ts. */
export const APP_BUILD_DATE = __ATHENA_BUILD_DATE__

/**
 * Donate link shown in the sidebar header (the owner's public PayPal.Me page).
 * The previous `paypal.com/donate/?business=...` link could not accept
 * donations for this account (verified in Athena Web 2 on 2026-11-22).
 */
export const DONATE_URL = 'https://paypal.me/jeroenvdvelden'

/**
 * AR's extension DLL provides lazes, projectile/fired telemetry and kill
 * events, so those features are on. Mission markers are not streamed by AR's
 * backend yet (GameFrame has no markers), so the marker toggles stay hidden.
 */
export const CAPABILITIES: AppCapabilities = {
  lazes: true,
  projectiles: true,
  killFeed: true,
  relayMarkers: false,
  waypointToggle: true,
  // No offline world picker in AR yet: the sidebar shows "Waiting for a mission".
  worldPicker: false,
}

/**
 * Endpoints served by AR's ASP.NET backend (same paths as Web2's bridge).
 * AR's StaticMapController returns the land mask with row 0 = NORTH
 * (`Backend/Controllers/StaticMapController.cs`, "row 0 = north (image top)"),
 * the opposite of Web2's bridge. With 'south-first' the land fill would render
 * upside down. Grid size 1024 is AR's previous value.
 */
export const MAP_DATA: MapDataConfig = {
  treesUrl: () => `${API_BASE}/api/game/trees`,
  landmaskUrl: (world, gridSize) =>
    `${API_BASE}/api/staticmap/${encodeURIComponent(world)}/landmask?gridSize=${gridSize}`,
  landmaskGridSize: 1024,
  landmaskRowOrder: 'north-first',
}
