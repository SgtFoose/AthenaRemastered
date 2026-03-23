import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { GameFrame, FiredEvent, FiredImpactEvent, KilledEvent, WorldInfo, Road, ForestsData, MapLocation, MapStructure, ElevationsData, ServerSettings, ExportStatus } from '../types/game';

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
  const exportPollRef = useRef<number | null>(null);
  const exportPollStartedAtRef = useRef<number>(0);
  const currentWorldRef = useRef<string | null>(null);
  const [connected, setConnected]         = useState(false);
  const [frame, setFrame]                 = useState<GameFrame | null>(null);
  const [recentKills, setRecentKills]             = useState<KilledEvent[]>([]);
  const [recentFired, setRecentFired]             = useState<FiredEvent[]>([]);
  const [recentFiredImpacts, setRecentFiredImpacts] = useState<FiredImpactEvent[]>([]);
  const [worldInfo, setWorldInfo]         = useState<WorldInfo | null>(null);
  const [roads, setRoads]                 = useState<Road[]>([]);
  const [forests, setForests]             = useState<ForestsData | null>(null);
  const [locations, setLocations]         = useState<MapLocation[]>([]);
  const [structures, setStructures]       = useState<MapStructure[]>([]);
  const [elevations, setElevations]       = useState<ElevationsData | null>(null);
  const [serverSettings, setServerSettings] = useState<ServerSettings>({ showEast: true, showGuer: true, showCiv: true });
  const [exportStatus, setExportStatus]     = useState<ExportStatus>({ phase: 'idle', roadCount: 0, roadsComplete: false, treeCount: 0, treesComplete: false, forestCount: 0, forestsComplete: false, locationCount: 0, locationsComplete: false, structureCount: 0, structuresComplete: false, elevationCount: 0, elevationsComplete: false });

  // Clear all geometry and event state when the world changes
  const clearForNewWorld = useCallback(() => {
    setRoads([]);
    setForests(null);
    setLocations([]);
    setStructures([]);
    setElevations(null);
    setRecentKills([]);
    setRecentFired([]);
    setRecentFiredImpacts([]);
    setExportStatus({ phase: 'idle', roadCount: 0, roadsComplete: false, treeCount: 0, treesComplete: false, forestCount: 0, forestsComplete: false, locationCount: 0, locationsComplete: false, structureCount: 0, structuresComplete: false, elevationCount: 0, elevationsComplete: false });
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

  const fetchJson = useCallback(async <T,>(path: string): Promise<T | null> => {
    try {
      const r = await fetch(`${API_BASE}/api/game/${path}`);
      if (!r.ok) return null;
      return await r.json() as T;
    } catch { return null; }
  }, []);

  const hydrateSnapshot = useCallback(async () => {
    const [wi, r, f, l, s, e, es] = await Promise.all([
      fetchJson<WorldInfo>('worldinfo'),
      fetchJson<Road[]>('roads'),
      fetchJson<ForestsData>('forests'),
      fetchJson<MapLocation[]>('locations'),
      fetchJson<MapStructure[]>('structures'),
      fetchJson<ElevationsData>('elevations'),
      fetchJson<ExportStatus>('exportstatus'),
    ]);

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
  }, [fetchJson]);

  const stopExportPolling = useCallback(() => {
    if (exportPollRef.current !== null) {
      window.clearInterval(exportPollRef.current);
      exportPollRef.current = null;
    }
  }, []);

  const startExportPolling = useCallback(() => {
    stopExportPolling();
    exportPollStartedAtRef.current = Date.now();

    exportPollRef.current = window.setInterval(async () => {
      const status = await fetchJson<ExportStatus>('exportstatus');
      if (!status) return;
      setExportStatus(status);

      if (status.phase === 'cached' || status.phase === 'complete') {
        await hydrateSnapshot();
        stopExportPolling();
        return;
      }

      // Safety cutoff: stop polling after 2 minutes to avoid orphan timers.
      if (Date.now() - exportPollStartedAtRef.current > 120000) {
        stopExportPolling();
      }
    }, 1000);
  }, [fetchJson, hydrateSnapshot, stopExportPolling]);

  // Fetch cached geometry via REST on mount — reliable for large payloads (roads ~6 MB).
  // SignalR OnConnectedAsync only sends lightweight state (frame, settings, export status).
  // Live updates from the game still arrive via SignalR events.
  useEffect(() => {
    let cancelled = false;
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
  }, [fetchJson]);

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
    conn.on('Killed',      (e: KilledEvent)      => setRecentKills(prev        => [e, ...prev].slice(0, 50)));
    conn.on('Fired',       (e: FiredEvent)       => setRecentFired(prev        => [e, ...prev].slice(0, 200)));
    conn.on('FiredImpact', (e: FiredImpactEvent) => setRecentFiredImpacts(prev => [e, ...prev].slice(0, 500)));
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
    return () => {
      stopped = true;
      stopExportPolling();
      conn.stop();
    };
  }, [handleWorldInfo, stopExportPolling]);

  const requestWorldExport = useCallback((command: string, data: unknown[] = []) => {
    if (command === 'world') {
      setExportStatus({
        phase: 'exporting',
        roadCount: 0,
        roadsComplete: false,
        treeCount: 0,
        treesComplete: false,
        forestCount: 0,
        forestsComplete: false,
        locationCount: 0,
        locationsComplete: false,
        structureCount: 0,
        structuresComplete: false,
        elevationCount: 0,
        elevationsComplete: false,
      });
      // Clear stale geometry immediately so old rendered data cannot linger.
      setRoads([]);
      setForests(null);
      setLocations([]);
      setStructures([]);
      setElevations(null);
      startExportPolling();
    }
    connRef.current?.invoke('RequestWorldExport', command, '', data);
  }, [startExportPolling]);

  return { connected, frame, recentKills, recentFired, recentFiredImpacts, worldInfo, roads, forests, locations, structures, elevations, serverSettings, exportStatus, requestWorldExport };
}
