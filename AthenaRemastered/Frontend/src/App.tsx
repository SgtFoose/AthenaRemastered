import { Component, useState, useRef } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AthenaMap }   from './components/AthenaMap'
import { Sidebar }     from './components/Sidebar'
import { EventFeed }   from './components/EventFeed'
import { useAthenHub } from './hooks/useAthenaHub'
import { useStaticMap } from './hooks/useStaticMap'
import { useAthenaLibrary } from './hooks/useAthenaLibrary'
import { APP_VERSION } from './version'
import './App.css'

export type RenderMode = '2d' | 'heatmap1' | 'heatmap2'

export interface LayerVisibility {
  contours:   boolean
  roads:      boolean
  locations:  boolean
  groups:     boolean
  waypoints:  boolean
  vehicles:   boolean
  units:      boolean
}

interface MapErrorBoundaryProps {
  children: ReactNode
}

interface MapErrorBoundaryState {
  error: Error | null
}

class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): MapErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AthenaMap render error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#12181d',
          color: '#f0f3f6',
          padding: 24,
          textAlign: 'center',
          fontFamily: 'Segoe UI, system-ui, sans-serif',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Map render failed</div>
            <div style={{ fontSize: 13, opacity: 0.88 }}>{this.state.error.message}</div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  const { connected, frame, recentKills, recentFired, worldInfo, roads, forests, locations, structures, elevations, serverSettings, exportStatus, requestWorldExport } = useAthenHub()

  const units    = frame?.units    ?? {}
  const vehicles = frame?.vehicles ?? {}
  const groups   = frame?.groups   ?? {}
  const world     = worldInfo?.nameWorld ?? frame?.world?.nameWorld ?? frame?.mission?.world ?? 'Altis'

  // Load pre-computed Athena Desktop cache (contour lines + metadata) for the active world
  const { staticInfo, contours } = useStaticMap(world || null)

  // worldSize: prefer live SignalR data, fall back to static Athena Desktop cache, then default
  const worldSize = worldInfo?.size ?? frame?.world?.size ?? staticInfo?.worldSize ?? 10240

  // Load Athena Desktop vehicle/location classification library
  const { vehicleMap, locationMap } = useAthenaLibrary()

  const [layers, setLayers] = useState<LayerVisibility>({
    contours:   true,
    roads:      true,
    locations:  true,
    groups:     true,
    waypoints:  true,
    vehicles:   false,
    units:      false,
  })
  const [renderMode, setRenderMode] = useState<RenderMode>('2d')

  const toggleLayer = (key: keyof LayerVisibility) =>
    setLayers(prev => ({ ...prev, [key]: !prev[key] }))

  // Map focus callback — allows sidebar to pan the map to a world coordinate
  const mapFocusRef = useRef<(posX: number, posY: number) => void>(() => {})

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo-text">⬡ ATHENA REMASTERED</span>
          <span className="header-right">
            <span className="version-label">v{APP_VERSION}</span>
            <a
              className="donate-link"
              href="https://www.paypal.com/donate/?business=G76WK9YDWUSAE&item_name=Athena+Remastered+Dev&EUR&no_note=0"
              target="_blank"
              rel="noreferrer"
              title="Support development"
            >♥ Donate</a>
          </span>
        </div>
        <Sidebar
          frame={frame}
          connected={connected}
          onRequestWorld={() => requestWorldExport('world')}
          roadCount={roads.length}
          forestCellCount={forests?.cells.length ?? 0}
          locationCount={locations.length}
          structureCount={structures.length}
          elevationCellCount={elevations?.cells.length ?? 0}
          layers={layers}
          onToggleLayer={toggleLayer}
          renderMode={renderMode}
          onChangeRenderMode={setRenderMode}
          serverSettings={serverSettings}
          locations={locations}
          groups={groups}
          units={units}
          worldSize={worldSize}
          onFocusPosition={(posX, posY) => mapFocusRef.current(posX, posY)}
        />
      </aside>
      <main className="map-area">
        {/* Welcome overlay — shown when no world has been loaded yet */}
        {!worldInfo && (
          <div className="welcome-overlay">
            <img
              className="welcome-bg"
              src="/athena-default-bg.png"
              alt="Athena Remastered"
            />
            <div className="welcome-banner">
              <div className="welcome-title">⬡ ATHENA REMASTERED</div>
              <div className="welcome-status">
                {connected
                  ? 'Connected to server — waiting for game data…'
                  : 'Connecting to server…'}
              </div>
              <div className="welcome-instructions">
                <p>1. Run <code>Server/AthenaRemastered.Server.exe</code></p>
                <p>2. Launch Arma 3 with the <strong>Athena Remastered</strong> mod enabled</p>
                <p>3. Start or join a mission — live data will appear automatically</p>
              </div>
            </div>
          </div>
        )}
        <MapErrorBoundary>
          <AthenaMap
            units={units}
            vehicles={vehicles}
            groups={groups}
            worldSize={worldSize}
            world={world}
            roads={roads}
            forests={forests}
            locations={locations}
            structures={structures}
            elevations={elevations}
            contours={contours}
            vehicleMap={vehicleMap}
            locationMap={locationMap}
            layers={layers}
            onLayersChange={setLayers}
            renderMode={renderMode}
            onRegisterFocus={(fn) => { mapFocusRef.current = fn }}
          />
        </MapErrorBoundary>
        {exportStatus.phase !== 'idle' && (
          <div className="export-status-overlay">
            <div className="export-status-title">
              {exportStatus.phase === 'cached' ? '● Loaded from cache'
               : exportStatus.phase === 'complete' ? '● Export complete'
               : '● Exporting world data…'}
            </div>
            <div className="export-status-row">
              <span className={exportStatus.roadsComplete ? 'done' : 'pending'}>
                Roads: {exportStatus.roadCount}{exportStatus.roadsComplete ? ' ✓' : '…'}
              </span>
            </div>
            <div className="export-status-row">
              <span className={exportStatus.forestsComplete ? 'done' : 'pending'}>
                Forests: {exportStatus.forestCount}{exportStatus.forestsComplete ? ' ✓' : '…'}
              </span>
            </div>
            <div className="export-status-row">
              <span className={exportStatus.locationsComplete ? 'done' : 'pending'}>
                Locations: {exportStatus.locationCount}{exportStatus.locationsComplete ? ' ✓' : '…'}
              </span>
            </div>
            <div className="export-status-row">
              <span className={exportStatus.structuresComplete ? 'done' : 'pending'}>
                Structures: {exportStatus.structureCount}{exportStatus.structuresComplete ? ' ✓' : '…'}
              </span>
            </div>
            <div className="export-status-row">
              <span className={exportStatus.elevationsComplete ? 'done' : 'pending'}>
                Elevations: {exportStatus.elevationCount}{exportStatus.elevationsComplete ? ' ✓' : '…'}
              </span>
            </div>
          </div>
        )}
      </main>
      <aside className="event-panel">
        <div className="panel-header">EVENTS</div>
        <EventFeed kills={recentKills} fired={recentFired} />
      </aside>
    </div>
  )
}

export default App
