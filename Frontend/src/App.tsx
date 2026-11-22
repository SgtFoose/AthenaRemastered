/**
 * Athena Remastered app root.
 *
 * Composes the shared UI core (`./core`, copied one-way from Athena Web 2;
 * see Web2's docs/ui-core-sync.md) with AR's own parts:
 * - `./adapter/useAthenaHub`: SignalR data layer to AR's ASP.NET backend
 * - `./extensions/projectileTracking`: lazes, projectile tracking and
 *   Fire Control (needs AR's extension DLL telemetry), plugged into the core
 *   map's extension slots
 * - `./components/EventFeed`: kill/shot feed in the right panel
 *
 * Which world is shown: only the world of a LIVE mission (frame.mission set
 * by the game). Before 2026-11-22 the map also showed the backend's
 * auto-loaded last-used world, so users saw e.g. Malden while Arma was still
 * in the main menu and thought the game was stuck. Until a mission is live,
 * the welcome screen is shown instead.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
// Shared UI core (owned by Athena Web 2; do not edit here, re-sync instead)
import { AthenaMap } from './core/components/AthenaMap'
import { Sidebar } from './core/components/Sidebar'
import { AppShell } from './core/components/AppShell'
import { SidebarHeader } from './core/components/SidebarHeader'
import { ITgtTargetsPanel } from './core/components/ITgtTargetsPanel'
import { WelcomeOverlay } from './core/components/WelcomeOverlay'
import { ExportStatusOverlay } from './core/components/ExportStatusOverlay'
import { MapErrorBoundary } from './core/components/MapErrorBoundary'
import { useStaticMap } from './core/hooks/useStaticMap'
import { useAthenaLibrary } from './core/hooks/useAthenaLibrary'
import { useITgtTargets } from './core/hooks/useITgtTargets'
import { useFollowActivePlayer } from './core/hooks/useFollowActivePlayer'
import { useTouchInput } from './core/hooks/useTouchInput'
import type { LayerVisibility, RenderMode } from './core/types/ui'
import './core/styles/app.css'
// AR-only parts
import { useAthenHub } from './adapter/useAthenaHub'
import { EventFeed } from './components/EventFeed'
import {
  ProjectileTrackingLayers,
  FireControlPanel,
  useRecentShooterIds,
  type ProjectileDebugEntry,
} from './extensions/projectileTracking'

/** Fallback world size in metres before any world metadata is known. */
const DEFAULT_WORLD_SIZE_M = 10240

/** AR has no offline world picker yet; the core sidebar gets an empty list. */
const NO_CACHED_WORLDS: string[] = []

function App() {
  const {
    connected,
    frame,
    recentKills,
    recentFired,
    recentFiredImpacts,
    worldInfo,
    roads,
    forests,
    locations,
    structures,
    elevations,
    serverSettings,
    exportStatus,
    requestWorldExport,
  } = useAthenHub()

  // A mission is live once the game has reported one (put mission → frame.mission).
  const liveWorld = frame?.mission
    ? (frame?.world?.nameWorld || frame.mission.world || '')
    : ''
  const hasLiveTelemetry = connected && liveWorld.length > 0
  const world = hasLiveTelemetry ? liveWorld : ''
  const hasActiveWorld = world.length > 0

  const units    = hasLiveTelemetry ? (frame?.units    ?? {}) : {}
  const vehicles = hasLiveTelemetry ? (frame?.vehicles ?? {}) : {}
  const groups   = hasLiveTelemetry ? (frame?.groups   ?? {}) : {}
  const lazes    = hasLiveTelemetry ? (frame?.lazes    ?? []) : []
  const firedEvents  = hasLiveTelemetry ? recentFired : []
  const firedImpacts = hasLiveTelemetry ? recentFiredImpacts : []

  // Pre-computed Athena Desktop cache (contour lines + metadata) for the active world.
  const { staticInfo, contours } = useStaticMap(world || null)

  // AR's game export reports the real world size, so prefer live data, then cache metadata.
  const worldSize = hasActiveWorld
    ? (frame?.world?.size ?? worldInfo?.size ?? staticInfo?.worldSize ?? DEFAULT_WORLD_SIZE_M)
    : DEFAULT_WORLD_SIZE_M

  const { vehicleMap, locationMap } = useAthenaLibrary()

  const [layers, setLayers] = useState<LayerVisibility>({
    contours:   true,
    forest:     true,
    trees:      true,
    roads:      true,
    structures: true,
    locations:  true,
    // AR's backend streams no mission markers yet (CAPABILITIES.relayMarkers = false).
    armaMarkers: false,
    firewillITgtMarkers: false,
    aoMarkers:  false,
    spawnMarkers:false,
    groups:     true,
    waypoints:  true,
    lazes:      true,
    projectiles:true,
    vehicles:   false,
    units:      false,
  })
  const [renderMode, setRenderMode] = useState<RenderMode>('2d')
  const isTouchInput = useTouchInput()
  const itgt = useITgtTargets()
  const {
    followActivePlayer,
    setFollowActivePlayer,
    activePlayerAnchor,
    toggleFollowActivePlayer,
    mapFocusRef,
    mapPanRef,
  } = useFollowActivePlayer(frame, units, vehicles)
  const pulseUnitIds = useRecentShooterIds(firedEvents)
  const [projectileDebugEntries, setProjectileDebugEntries] = useState<ProjectileDebugEntry[]>([])

  // Bumped to remount AthenaMap (fresh Leaflet state) on world/session changes.
  const [mapSessionKey, setMapSessionKey] = useState(0)
  const previousWorldRef = useRef('')
  const previousConnectedRef = useRef(false)
  const hadLiveTelemetryRef = useRef(false)

  const toggleLayer = (key: keyof LayerVisibility) =>
    setLayers(prev => ({ ...prev, [key]: !prev[key] }))

  const handleRequestWorld = useCallback(() => {
    setMapSessionKey(prev => prev + 1)
    requestWorldExport('world')
  }, [requestWorldExport])

  useEffect(() => {
    const worldKey = world || ''
    const justConnected = connected && !previousConnectedRef.current
    const worldChanged = worldKey !== previousWorldRef.current
    if ((justConnected && worldKey) || (worldKey && worldChanged)) {
      setMapSessionKey(prev => prev + 1)
    }
    previousConnectedRef.current = connected
    previousWorldRef.current = worldKey
  }, [connected, world])

  const { reset: resetITgtTargets } = itgt
  useEffect(() => {
    const justLostLiveTelemetry = !hasLiveTelemetry && hadLiveTelemetryRef.current
    if (justLostLiveTelemetry) {
      // Leaving the mission starts a clean tactical session.
      resetITgtTargets()
      setFollowActivePlayer(false)
      setProjectileDebugEntries([])
      setMapSessionKey(prev => prev + 1)
    }
    hadLiveTelemetryRef.current = hasLiveTelemetry
  }, [hasLiveTelemetry, resetITgtTargets, setFollowActivePlayer])

  const welcomeStatusText = !connected
    ? 'Connecting to server...'
    : exportStatus.phase === 'exporting'
    ? 'Loading world data...'
    : 'Connected to server - waiting for a mission...'

  return (
    <AppShell
      sidebar={(
        <>
          <SidebarHeader />
          <Sidebar
            frame={frame}
            connected={connected}
            onRequestWorld={handleRequestWorld}
            roadCount={roads.length}
            treeCount={exportStatus.treeCount}
            forestCellCount={forests?.cells.length ?? 0}
            locationCount={locations.length}
            structureCount={structures.length}
            elevationCellCount={elevations?.cells.length ?? 0}
            cachedWorlds={NO_CACHED_WORLDS}
            selectedWorld=""
            liveWorld={liveWorld}
            onSelectWorld={() => {}}
            layers={layers}
            onToggleLayer={toggleLayer}
            followActivePlayer={followActivePlayer}
            activePlayerName={activePlayerAnchor?.name ?? null}
            onToggleFollowActivePlayer={toggleFollowActivePlayer}
            renderMode={renderMode}
            onChangeRenderMode={setRenderMode}
            serverSettings={serverSettings}
            locations={locations}
            groups={groups}
            units={units}
            onFocusPosition={(posX, posY) => mapFocusRef.current(posX, posY)}
          />
        </>
      )}
      rightPanel={(
        <>
          <ITgtTargetsPanel
            targets={itgt.targets}
            isTouchInput={isTouchInput}
            onRename={itgt.rename}
            onDelete={itgt.remove}
            onDeleteAll={itgt.reset}
            onCopy={itgt.copy}
          />
          <div className="panel-header">EVENTS</div>
          <EventFeed kills={recentKills} fired={recentFired} />
        </>
      )}
    >
      {!hasActiveWorld && (
        <WelcomeOverlay
          statusText={welcomeStatusText}
          exportProgress={connected && exportStatus.phase === 'exporting' ? exportStatus : null}
          instructions={(
            <>
              <p>1. Run <code>Server/AthenaRemastered.Server.exe</code></p>
              <p>2. Launch Arma 3 with the <strong>Athena Remastered</strong> mod enabled (no BattlEye: <code>-noBE</code>)</p>
              <p>3. Start or join a mission - live data will appear automatically</p>
            </>
          )}
        />
      )}
      <MapErrorBoundary>
        <AthenaMap
          key={`${world || 'noworld'}:${worldSize}:${mapSessionKey}`}
          units={units}
          vehicles={vehicles}
          groups={groups}
          pulseUnitIds={pulseUnitIds}
          worldSize={worldSize}
          world={world}
          roads={hasActiveWorld ? roads : []}
          forests={hasActiveWorld ? forests : null}
          locations={hasActiveWorld ? locations : []}
          structures={hasActiveWorld ? structures : []}
          elevations={hasActiveWorld ? elevations : null}
          contours={hasActiveWorld ? contours : []}
          vehicleMap={vehicleMap}
          locationMap={locationMap}
          layers={layers}
          onLayersChange={setLayers}
          renderMode={renderMode}
          onRegisterFocus={(fn) => { mapFocusRef.current = fn }}
          onRegisterPan={(fn) => { mapPanRef.current = fn }}
          onUserInteraction={() => setFollowActivePlayer(false)}
          storedITgtTargets={itgt.targets}
          onStoreCursorITgt={itgt.store}
          isTouchInput={isTouchInput}
          mapExtensions={(
            <ProjectileTrackingLayers
              units={units}
              vehicles={vehicles}
              groups={groups}
              lazes={lazes}
              firedEvents={firedEvents}
              firedImpacts={firedImpacts}
              worldSize={worldSize}
              onProjectileDebugChange={setProjectileDebugEntries}
            />
          )}
          overlayExtensions={<FireControlPanel entries={projectileDebugEntries} />}
        />
      </MapErrorBoundary>
      {hasActiveWorld && <ExportStatusOverlay status={exportStatus} />}
    </AppShell>
  )
}

export default App
