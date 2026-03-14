import { useState, useEffect } from 'react';
import type { StaticWorldInfo, ContourLine } from '../types/game';
import { API_BASE } from '../apiBase';

const API = `${API_BASE}/api/staticmap`;

/**
 * Fetches pre-computed contour data from the Athena Desktop cache via the
 * backend REST endpoints.
 *
 * On worldName change:
 *  1. Fetches /api/staticmap/{worldName} for metadata (cellSize, availableZ, …)
 *  2. Fetches all major contours (Z divisible by 20, plus sea level) in parallel.
 *
 * Contour lines are returned as ContourLine[], where each `lines` entry is a
 * flat array of alternating world-metre coordinates [x0,y0,x1,y1,...].
 * Convert to Leaflet LatLng: lat = y * scale, lng = x * scale.
 */
export function useStaticMap(worldName: string | null) {
  const [staticInfo, setStaticInfo] = useState<StaticWorldInfo | null>(null);
  const [contours,   setContours]   = useState<ContourLine[]>([]);

  // Fetch world metadata whenever the active world changes
  useEffect(() => {
    if (!worldName) { setStaticInfo(null); setContours([]); return; }

    let cancelled = false;
    fetch(`${API}/${encodeURIComponent(worldName)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: StaticWorldInfo | null) => { if (!cancelled && data) setStaticInfo(data); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [worldName]);

  // Once we have metadata, fetch major contour levels in parallel
  useEffect(() => {
    if (!staticInfo) { setContours([]); return; }

    let cancelled = false;
    setContours([]);

    // Major = sea level + every 20 m (index contours every 100 m are a subset)
    const majorZ = staticInfo.availableZ.filter(z => z === 0 || z % 20 === 0);

    Promise.all(
      majorZ.map(z =>
        fetch(`${API}/${encodeURIComponent(staticInfo.worldName)}/contours/${z}`)
          .then(r => (r.ok ? (r.json() as Promise<ContourLine>) : null))
          .catch(() => null),
      ),
    ).then(results => {
      if (!cancelled)
        setContours(results.filter((r): r is ContourLine => r !== null));
    });

    return () => { cancelled = true; };
  }, [staticInfo]);

  return { staticInfo, contours };
}
