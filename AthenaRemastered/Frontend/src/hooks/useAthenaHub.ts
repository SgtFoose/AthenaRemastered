import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameFrame, FiredEvent, KilledEvent, WorldInfo, Road, ForestsData, MapLocation, MapStructure, ElevationsData, ServerSettings, ExportStatus } from '../types/game';

import { API_BASE } from '../apiBase';

const HUB_URL = `${API_BASE}/hub`;

// Arma 3 map coordinate → Leaflet LatLng conversion.
// Arma uses [X=East, Y=North] in metres; Leaflet uses [lat=Y, lng=X].
// We use a simple CRS that maps metres 1:1, so the "world" is [0,0] to [worldSize, worldSize].
// We invert Y so that North (high Y) is up on the map.
export function armaToLatLng(posX: number, posY: number, worldSize: number): [number, number] {
  return [posY / worldSize * 100, posX / worldSize * 100];
}

export function useAthenHub() {
  const connRef = useRef<HubConnection | null>(null);
  const currentWorldRef = useRef<string | null>(null);
  const [connected, setConnected]         = useState(false);
  const [frame, setFrame]                 = useState<GameFrame | null>(null);
  const [recentKills, setRecentKills]     = useState<KilledEvent[]>([]);
  const [recentFired, setRecentFired]     = useState<FiredEvent[]>([]);
  const [worldInfo, setWorldInfo]         = useState<WorldInfo | null>(null);
  const [roads, setRoads]                 = useState<Road[]>([]);
  const [forests, setForests]             = useState<ForestsData | null>(null);
  const [locations, setLocations]         = useState<MapLocation[]>([]);
  const [structures, setStructures]       = useState<MapStructure[]>([]);
  const [elevations, setElevations]       = useState<ElevationsData | null>(null);
  const [serverSettings, setServerSettings] = useState<ServerSettings>({ showEast: false, showGuer: false, showCiv: false });
  const [exportStatus, setExportStatus]     = useState<ExportStatus>({ phase: 'idle', roadCount: 0, roadsComplete: false, forestCount: 0, forestsComplete: false, locationCount: 0, locationsComplete: false, structureCount: 0, structuresComplete: false, elevationCount: 0, elevationsComplete: false });

  // Clear all geometry and event state when the world changes
  const clearForNewWorld = useCallback(() => {
    setRoads([]);
    setForests(null);
    setLocations([]);
    setStructures([]);
    setElevations(null);
    setRecentKills([]);
    setRecentFired([]);
    setExportStatus({ phase: 'idle', roadCount: 0, roadsComplete: false, forestCount: 0, forestsComplete: false, locationCount: 0, locationsComplete: false, structureCount: 0, structuresComplete: false, elevationCount: 0, elevationsComplete: false });
  }, []);

  // Detect world change and clear stale data
  const handleWorldInfo = useCallback((wi: WorldInfo) => {
    const prev = currentWorldRef.current;
    if (prev && prev !== wi.nameWorld) {
      clearForNewWorld();
    }
    currentWorldRef.current = wi.nameWorld;
    setWorldInfo(wi);
  }, [clearForNewWorld]);

  // Fetch cached geometry via REST on mount — reliable for large payloads (roads ~6 MB).
  // SignalR OnConnectedAsync only sends lightweight state (frame, settings, export status).
  // Live updates from the game still arrive via SignalR events.
  useEffect(() => {
    let cancelled = false;
    const fetchJson = async <T,>(path: string): Promise<T | null> => {
      try {
        const r = await fetch(`${API_BASE}/api/game/${path}`);
        if (!r.ok) return null;
        return await r.json() as T;
      } catch { return null; }
    };
    const hydrate = async () => {
      const [wi, r, f, l, s, e, es] = await Promise.all([
        fetchJson<WorldInfo>('worldinfo'),
        fetchJson<Road[]>('roads'),
        fetchJson<ForestsData>('forests'),
        fetchJson<MapLocation[]>('locations'),
        fetchJson<MapStructure[]>('structures'),
        fetchJson<ElevationsData>('elevations'),
        fetchJson<ExportStatus>('exportstatus'),
      ]);
      if (cancelled) return;
      if (wi) {
        currentWorldRef.current = wi.nameWorld;
        setWorldInfo(wi);
      }
      if (r)  setRoads(r);
      if (f)  setForests(f);
      if (l)  setLocations(l);
      if (s)  setStructures(s);
      if (e)  setElevations(e);
      if (es) setExportStatus(es);
    };
    hydrate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const conn = new HubConnectionBuilder()
      .withUrl(HUB_URL)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    conn.on('Frame',     (f: GameFrame)     => {
      setFrame(f);
      // Pick up WorldInfo from the frame snapshot too (for reconnects)
      if (f.world) handleWorldInfo(f.world);
    });
    conn.on('Killed',    (e: KilledEvent)   => setRecentKills(prev => [e, ...prev].slice(0, 50)));
    conn.on('Fired',     (e: FiredEvent)    => setRecentFired(prev  => [e, ...prev].slice(0, 200)));
    conn.on('WorldInfo', (wi: WorldInfo)    => handleWorldInfo(wi));
    conn.on('Roads',      (r: Road[])         => setRoads(r));
    conn.on('Forests',    (fd: ForestsData)   => setForests(fd));
    conn.on('Locations',  (l: MapLocation[])  => setLocations(l));
    conn.on('Structures', (s: MapStructure[])  => setStructures(s));
    conn.on('Elevations', (e: ElevationsData)  => setElevations(e));
    conn.on('ServerSettings', (s: ServerSettings) => setServerSettings(s));
    conn.on('ExportStatus',   (s: ExportStatus)   => setExportStatus(s));

    conn.onclose(()      => setConnected(false));
    conn.onreconnected(() => setConnected(true));

    // eslint-disable-next-line react-hooks/exhaustive-deps

    // withAutomaticReconnect() only retries after a successful initial connect.
    // This loop retries the very first connection attempt until the backend is up.
    let stopped = false;
    const startWithRetry = async () => {
      while (!stopped) {
        try {
          await conn.start();
          setConnected(true);
          return;
        } catch {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    };
    startWithRetry();

    connRef.current = conn;
    return () => { stopped = true; conn.stop(); };
  }, [handleWorldInfo]);

  const requestWorldExport = useCallback((command: string, data: unknown[] = []) => {
    connRef.current?.invoke('RequestWorldExport', command, '', data);
  }, []);

  return { connected, frame, recentKills, recentFired, worldInfo, roads, forests, locations, structures, elevations, serverSettings, exportStatus, requestWorldExport };
}
