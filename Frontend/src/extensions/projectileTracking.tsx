/**
 * Athena Remastered extension: active lazes, projectile tracking and the
 * Fire Control panel.
 *
 * These features need AR's custom extension DLL telemetry (lazes, fired and
 * fired_impact events), so they are NOT part of the shared UI core copied
 * from Athena Web 2 (see Web2 docs/ui-core-sync.md). They plug into the core
 * map through its extension slots:
 * - <ProjectileTrackingLayers/> goes into AthenaMap's `mapExtensions` (inside
 *   the Leaflet map, so it can use useMap()). It draws into the core's
 *   reserved panes `athena-laze` (z 716) and `athena-projectile` (z 717); the
 *   core toggles their visibility from layers.lazes / layers.projectiles.
 * - <FireControlPanel/> goes into AthenaMap's `overlayExtensions`.
 * - useRecentShooterIds() feeds AthenaMap's `pulseUnitIds` (firing pulse).
 *
 * Origin: ported unchanged in behaviour from AR's map code (via Athena Web 2
 * commit 966b6bc) on 2026-11-22. Known bugs (MLRS no track, M4 hull-heading
 * fallback, Mk6 mortar tracks only on the first shot until F5, client-clock
 * dependence) are logged in WORKLOG.md and are addressed by the planned
 * "projectile tracking v2" redesign, not in this port.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Unit, Vehicle, Group, FiredEvent, FiredImpactEvent, ActiveLaze } from '../core/types/game';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


type ProjectileProfile = {
  speedMps: number;
  rangeM: number;
  lateralFactor: number;
  color: string;
  headingOffsetDeg?: number;
  maxTrackAngleDeg: number;
  requiresLock: boolean;
  allowEnemyTargetInference: boolean;
  preferLiveLaze: boolean;
  launchDelayMs: number;
  lingerAfterImpactMs: number;
  // Ballistic trajectory: ETA (s) = ballA * distance^ballB  derived from live calibration.
  // When set, overrides the fixed-speed speedMps formula for ETA calculation.
  useBallistics?: boolean;
  ballA?: number;
  ballB?: number;
};

type TargetEstimate = {
  x: number;
  y: number;
  source: 'event' | 'laze' | 'waypoint' | 'enemy' | 'unit' | 'heading';
  eventSource?: string;
};

type GuidedLock = {
  kind: 'unit' | 'laze';
  unitId: string;
};


function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}


function normDeg(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function shortestAngleDiff(a: number, b: number): number {
  const d = Math.abs(normDeg(a) - normDeg(b));
  return d > 180 ? 360 - d : d;
}

function getProjectileProfile(ev: FiredEvent): ProjectileProfile | null {
  const text = `${ev.weapon} ${ev.ammo} ${ev.projectile}`.toLowerCase();
  if (!text.trim()) return null;

  if (text.includes('cruise')) {
    // Calibrated from live VLS tests: practical time-of-flight is about 14s at ~1500m.
    return { speedMps: 110, rangeM: 14000, lateralFactor: 0.12, color: '#ff6b6b', maxTrackAngleDeg: 70, requiresLock: true, allowEnemyTargetInference: true, preferLiveLaze: true, launchDelayMs: 1200, lingerAfterImpactMs: 9500 };
  }
  if ((text.includes('artillery') || text.includes('shell') || text.includes('mortar')) &&
      !text.includes('shipcannon') &&
      !text.includes('weapon_shipcannon_120mm')) {
    // Calibrated from M4 Scorcher: 1391m29s, 11178m72s  ETA  1.235  d^0.4363
     return { speedMps: 230, rangeM: 9000, lateralFactor: 0, color: '#ffd43b', maxTrackAngleDeg: 28, requiresLock: false, allowEnemyTargetInference: false, preferLiveLaze: false, launchDelayMs: 0, lingerAfterImpactMs: 2500, useBallistics: true, ballA: 1.235, ballB: 0.4363 };
  }
  if (text.includes('rocket') || text.includes('mlrs') || text.includes('230mm')) {
    // Calibrated from MLRS rockets_230mm_GAT: 1393m23s  ETA  0.979  d^0.4363 (same exponent as SPG)
     return { speedMps: 190, rangeM: 5000, lateralFactor: 0, color: '#74c0fc', maxTrackAngleDeg: 22, requiresLock: false, allowEnemyTargetInference: false, preferLiveLaze: false, launchDelayMs: 0, lingerAfterImpactMs: 2500, useBallistics: true, ballA: 0.979, ballB: 0.4363 };
  }
  if (text.includes('shipcannon')) {
    // MK45 naval gun (weapon_ShipCannon_120mm). Non-monotonic ETA curve  medium ranges are slowest
    // (high-arc trajectory). Ballistic fit anchored at 762m29s and 12352m76s.
    // fired_impact telemetry will correct the mid-range underestimate after the first shot lands.
    // lateralFactor: 0  indirect fire flies a straight horizontal path; curvature is only vertical.
    // A non-zero factor always curves left of the bearing which looks wrong (south for NW shots, etc.).
    return { speedMps: 90, rangeM: 14000, lateralFactor: 0, color: '#e599f7', maxTrackAngleDeg: 22, requiresLock: false, allowEnemyTargetInference: false, preferLiveLaze: false, launchDelayMs: 0, lingerAfterImpactMs: 2500, useBallistics: true, ballA: 3.424, ballB: 0.3457 };
  }
  if (text.includes('missile') || text.includes('sam') || text.includes('at')) {
    return { speedMps: 300, rangeM: 7000, lateralFactor: 0.06, color: '#ffa94d', maxTrackAngleDeg: 40, requiresLock: true, allowEnemyTargetInference: true, preferLiveLaze: false, launchDelayMs: 0, lingerAfterImpactMs: 2500 };
  }
  return null;
}

function targetFromFiredEvent(ev: FiredEvent): TargetEstimate | null {
  if (!ev.targetSource?.trim()) return null;
  if (typeof ev.targetX !== 'number' || !Number.isFinite(ev.targetX)) return null;
  if (typeof ev.targetY !== 'number' || !Number.isFinite(ev.targetY)) return null;

  const source = ev.targetSource.toLowerCase();
  const text = `${ev.weapon} ${ev.ammo} ${ev.projectile}`.toLowerCase();
  const isUnguidedIndirect = text.includes('rocket') || text.includes('mlrs') || text.includes('230mm') || text.includes('artillery') || text.includes('shell') || text.includes('mortar') || text.includes('shipcannon');

  // Ignore broad laser/scan target inference for unguided indirect fire.
  if (isUnguidedIndirect && source !== 'assigned') return null;

  return {
    x: ev.targetX,
    y: ev.targetY,
    source: 'event',
    eventSource: ev.targetSource,
  };
}

function projectileSourceTag(target: TargetEstimate): string {
  if (target.source === 'event') {
    switch ((target.eventSource ?? '').toLowerCase()) {
      case 'assigned': return 'LOCK';
      case 'laser': return 'LASE';
      case 'scan': return 'SCAN';
      default: return 'RPT';
    }
  }
  if (target.source === 'laze') return 'LASE';
  if (target.source === 'unit') return 'TGT';
  return target.source === 'waypoint' ? 'WP' : target.source === 'enemy' ? 'TGT' : 'HDG';
}

function findNearestEnemyUnitId(
  srcX: number,
  srcY: number,
  dirDeg: number,
  shooterSide: string,
  allUnits: Record<string, Unit>,
  profile: ProjectileProfile,
): string | null {
  if (!profile.allowEnemyTargetInference) return null;

  const rad = (dirDeg * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = Math.cos(rad);
  const maxTrackCos = Math.cos((profile.maxTrackAngleDeg * Math.PI) / 180);

  let best: { id: string; score: number } | null = null;
  for (const u of Object.values(allUnits)) {
    if (u.side === shooterSide) continue;
    if (!Number.isFinite(u.posX) || !Number.isFinite(u.posY)) continue;
    if (u.posX === 0 && u.posY === 0) continue;

    const dx = u.posX - srcX;
    const dy = u.posY - srcY;
    const dist = Math.hypot(dx, dy);
    if (dist < 50 || dist > profile.rangeM * 1.35) continue;

    const nx = dx / dist;
    const ny = dy / dist;
    const dot = nx * fx + ny * fy;
    if (dot < maxTrackCos) continue;

    const anglePenalty = 1 - dot;
    const rangePenalty = dist / Math.max(profile.rangeM, 1);
    const score = anglePenalty * 0.7 + rangePenalty * 0.3;
    if (!best || score < best.score) best = { id: u.id, score };
  }

  return best?.id ?? null;
}

function findNearestLazeUnitId(
  srcX: number,
  srcY: number,
  dirDeg: number,
  shooterUnitId: string,
  lazes: ActiveLaze[],
  profile: ProjectileProfile,
): string | null {
  if (lazes.length === 0) return null;

  const ownLaze = lazes.find(l => l.unitId === shooterUnitId);
  if (ownLaze && Number.isFinite(ownLaze.posX) && Number.isFinite(ownLaze.posY)) {
    return ownLaze.unitId;
  }

  const rad = (dirDeg * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = Math.cos(rad);
  const maxTrackCos = Math.cos((Math.min(85, profile.maxTrackAngleDeg + 15) * Math.PI) / 180);

  let best: { unitId: string; score: number } | null = null;
  for (const l of lazes) {
    if (!Number.isFinite(l.posX) || !Number.isFinite(l.posY)) continue;

    const dx = l.posX - srcX;
    const dy = l.posY - srcY;
    const dist = Math.hypot(dx, dy);
    if (dist < 50 || dist > profile.rangeM * 1.35) continue;

    const nx = dx / dist;
    const ny = dy / dist;
    const dot = nx * fx + ny * fy;
    if (dot < maxTrackCos) continue;

    const anglePenalty = 1 - dot;
    const rangePenalty = dist / Math.max(profile.rangeM, 1);
    const score = anglePenalty * 0.75 + rangePenalty * 0.25;
    if (!best || score < best.score) best = { unitId: l.unitId, score };
  }

  return best?.unitId ?? null;
}

function findNearestLazeUnitIdByTargetPoint(
  targetX: number,
  targetY: number,
  lazes: ActiveLaze[],
  maxDist = 1200,
): string | null {
  let best: { unitId: string; dist: number } | null = null;
  for (const l of lazes) {
    if (!Number.isFinite(l.posX) || !Number.isFinite(l.posY)) continue;
    const dist = Math.hypot(l.posX - targetX, l.posY - targetY);
    if (dist > maxDist) continue;
    if (!best || dist < best.dist) {
      best = { unitId: l.unitId, dist };
    }
  }
  return best?.unitId ?? null;
}

function resolveGuidedLockTarget(
  lock: GuidedLock,
  units: Record<string, Unit>,
  lazes: ActiveLaze[],
  worldSize: number,
): TargetEstimate | null {
  if (lock.kind === 'unit') {
    const unit = units[lock.unitId];
    if (!unit) return null;
    if (!Number.isFinite(unit.posX) || !Number.isFinite(unit.posY)) return null;
    if (unit.posX === 0 && unit.posY === 0) return null;
    return {
      x: clamp(unit.posX, 0, worldSize),
      y: clamp(unit.posY, 0, worldSize),
      source: 'unit',
    };
  }

  const laze = lazes.find(l => l.unitId === lock.unitId);
  if (!laze) return null;
  if (!Number.isFinite(laze.posX) || !Number.isFinite(laze.posY)) return null;
  return {
    x: clamp(laze.posX, 0, worldSize),
    y: clamp(laze.posY, 0, worldSize),
    source: 'laze',
  };
}

function acquireGuidedLock(
  ev: FiredEvent,
  launchX: number,
  launchY: number,
  launchDirDeg: number,
  shooterSide: string,
  units: Record<string, Unit>,
  lazes: ActiveLaze[],
  profile: ProjectileProfile,
): GuidedLock | null {
  const source = (ev.targetSource ?? '').toLowerCase();
  const preferLaze = profile.preferLiveLaze || source === 'laser' || source === 'scan';

  // If telemetry says this was laser-based, keep lock on active laze first.
  if (preferLaze) {
    if (typeof ev.targetX === 'number' && Number.isFinite(ev.targetX) && typeof ev.targetY === 'number' && Number.isFinite(ev.targetY)) {
      const byTargetPoint = findNearestLazeUnitIdByTargetPoint(ev.targetX, ev.targetY, lazes);
      if (byTargetPoint) {
        return { kind: 'laze', unitId: byTargetPoint };
      }
    }

    const lazeUnitId = findNearestLazeUnitId(launchX, launchY, launchDirDeg, ev.unitId, lazes, profile);
    if (lazeUnitId) {
      return { kind: 'laze', unitId: lazeUnitId };
    }
  }

  const eventEntityId = ev.targetEntityId?.trim();
  if (eventEntityId) {
    const byId = units[eventEntityId];
    if (byId && Number.isFinite(byId.posX) && Number.isFinite(byId.posY)) {
      return { kind: 'unit', unitId: byId.id };
    }
  }

  if (typeof ev.targetX === 'number' && Number.isFinite(ev.targetX) && typeof ev.targetY === 'number' && Number.isFinite(ev.targetY)) {
    let nearest: { id: string; dist: number } | null = null;
    for (const u of Object.values(units)) {
      if (u.side === shooterSide) continue;
      if (!Number.isFinite(u.posX) || !Number.isFinite(u.posY)) continue;
      const dist = Math.hypot(u.posX - ev.targetX, u.posY - ev.targetY);
      if (dist > 1000) continue;
      if (!nearest || dist < nearest.dist) nearest = { id: u.id, dist };
    }
    if (nearest) {
      return { kind: 'unit', unitId: nearest.id };
    }
  }

  const inferredUnitId = findNearestEnemyUnitId(launchX, launchY, launchDirDeg, shooterSide, units, profile);
  if (inferredUnitId) {
    return { kind: 'unit', unitId: inferredUnitId };
  }

  const lazeUnitId = findNearestLazeUnitId(launchX, launchY, launchDirDeg, ev.unitId, lazes, profile);
  if (lazeUnitId) {
    return { kind: 'laze', unitId: lazeUnitId };
  }

  return null;
}

function targetFromLazes(
  srcX: number,
  srcY: number,
  dirDeg: number,
  shooterUnitId: string,
  lazes: ActiveLaze[],
  worldSize: number,
  profile: ProjectileProfile,
): TargetEstimate | null {
  if (lazes.length === 0) return null;

  const ownLaze = lazes.find(l => l.unitId === shooterUnitId);
  if (ownLaze && Number.isFinite(ownLaze.posX) && Number.isFinite(ownLaze.posY)) {
    return {
      x: clamp(ownLaze.posX, 0, worldSize),
      y: clamp(ownLaze.posY, 0, worldSize),
      source: 'laze',
    };
  }

  const rad = (dirDeg * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = Math.cos(rad);
  const maxTrackCos = Math.cos((Math.min(85, profile.maxTrackAngleDeg + 15) * Math.PI) / 180);

  let best: { x: number; y: number; score: number } | null = null;
  for (const l of lazes) {
    if (!Number.isFinite(l.posX) || !Number.isFinite(l.posY)) continue;
    const dx = l.posX - srcX;
    const dy = l.posY - srcY;
    const dist = Math.hypot(dx, dy);
    if (dist < 50 || dist > profile.rangeM * 1.35) continue;
    const nx = dx / dist;
    const ny = dy / dist;
    const dot = nx * fx + ny * fy;
    if (dot < maxTrackCos) continue;

    const anglePenalty = 1 - dot;
    const rangePenalty = dist / Math.max(profile.rangeM, 1);
    const score = anglePenalty * 0.75 + rangePenalty * 0.25;
    if (!best || score < best.score) best = { x: l.posX, y: l.posY, score };
  }

  if (!best) return null;
  return {
    x: clamp(best.x, 0, worldSize),
    y: clamp(best.y, 0, worldSize),
    source: 'laze',
  };
}

function lazeLabel(unit: Unit | undefined): string {
  if (!unit) return 'Laser';
  if (unit.playerName?.trim()) return unit.playerName.trim();
  return unit.name?.trim() || unit.type || 'Laser';
}

function estimateTarget(
  srcX: number,
  srcY: number,
  dirDeg: number,
  shooterSide: string,
  grp: Group | undefined,
  allUnits: Record<string, Unit>,
  worldSize: number,
  profile: ProjectileProfile,
): TargetEstimate {
  if (grp && (grp.wpX !== 0 || grp.wpY !== 0)) {
    return { x: grp.wpX, y: grp.wpY, source: 'waypoint' };
  }

  const rad = (dirDeg * Math.PI) / 180;
  const fx = Math.sin(rad);
  const fy = Math.cos(rad);
  const maxTrackCos = Math.cos((profile.maxTrackAngleDeg * Math.PI) / 180);

  if (profile.allowEnemyTargetInference) {
    let best: { x: number; y: number; score: number } | null = null;
    for (const u of Object.values(allUnits)) {
      if (u.side === shooterSide) continue;
      if (!Number.isFinite(u.posX) || !Number.isFinite(u.posY)) continue;
      if (u.posX === 0 && u.posY === 0) continue;
      const dx = u.posX - srcX;
      const dy = u.posY - srcY;
      const dist = Math.hypot(dx, dy);
      if (dist < 50 || dist > profile.rangeM * 1.25) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const dot = nx * fx + ny * fy;
      if (dot < maxTrackCos) continue;
      const anglePenalty = 1 - dot;
      const rangePenalty = dist / Math.max(profile.rangeM, 1);
      const score = anglePenalty * 0.7 + rangePenalty * 0.3;
      if (!best || score < best.score) best = { x: u.posX, y: u.posY, score };
    }

    if (best) return { x: best.x, y: best.y, source: 'enemy' };
  }

  const dx = Math.sin(rad) * profile.rangeM;
  const dy = Math.cos(rad) * profile.rangeM;
  return {
    x: clamp(srcX + dx, 0, worldSize),
    y: clamp(srcY + dy, 0, worldSize),
    source: 'heading',
  };
}

function buildPredictedPath(
  srcX: number,
  srcY: number,
  dstX: number,
  dstY: number,
  lateralFactor: number,
  progress: number,
  samples = 42,
): [number, number][] {
  const dx = dstX - srcX;
  const dy = dstY - srcY;
  const dist = Math.hypot(dx, dy);
  const nx = dist > 0.001 ? dx / dist : 1;
  const ny = dist > 0.001 ? dy / dist : 0;
  const px = -ny;
  const py = nx;
  const offset = dist * lateralFactor;

  const p0x = srcX;
  const p0y = srcY;
  const p1x = srcX + dx * 0.5 + px * offset;
  const p1y = srcY + dy * 0.5 + py * offset;
  const p2x = dstX;
  const p2y = dstY;

  const tMax = clamp(progress, 0, 1);
  const points: [number, number][] = [];
  const count = Math.max(2, Math.floor(samples * tMax));
  for (let i = 0; i <= count; i++) {
    const t = (i / count) * tMax;
    const inv = 1 - t;
    const x = inv * inv * p0x + 2 * inv * t * p1x + t * t * p2x;
    const y = inv * inv * p0y + 2 * inv * t * p1y + t * t * p2y;
    points.push([x, y]);
  }
  return points;
}


/** One row of the Fire Control panel (newest tracks first). */
export type ProjectileDebugEntry = {
  id: string;
  trackKey: string;
  shooter: string;
  weapon: string;
  lock: 'LAZE' | 'UNIT' | 'FREE';
  source: string;
  etaSec: number;
  target: string;
  lockSwitched: boolean;
};


/**
 * Props for the laze/projectile layers. Data comes from AR's SignalR hook.
 */
interface ProjectileTrackingLayersProps {
  units: Record<string, Unit>;
  vehicles: Record<string, Vehicle>;
  groups: Record<string, Group>;
  lazes: ActiveLaze[];
  firedEvents: FiredEvent[];
  firedImpacts: FiredImpactEvent[];
  worldSize: number;
  /** Receives the current Fire Control rows (max 5) after every redraw. */
  onProjectileDebugChange?: (entries: ProjectileDebugEntry[]) => void;
}

/**
 * Renders active laze markers and predicted projectile tracks into the core
 * map's reserved panes. Must be rendered inside AthenaMap (`mapExtensions`).
 * Re-renders once per second (clock) so predicted tracks advance.
 */
export function ProjectileTrackingLayers({ units, vehicles, groups, lazes, firedEvents, firedImpacts, worldSize, onProjectileDebugChange }: ProjectileTrackingLayersProps) {
  const map = useMap();

  // Layer groups and per-track state (created once per mounted map).
  const lazeLayerRef        = useRef<L.LayerGroup>(L.layerGroup());
  const projectileLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const projectileLaunchRef = useRef<Map<string, { x: number; y: number; dir: number }>>(new Map());
  const projectileLockRef = useRef<Map<string, GuidedLock>>(new Map());
  const projectileTerminalRef = useRef<Map<string, number>>(new Map());
  const projectileLastEtaRef = useRef<Map<string, number>>(new Map());
  const projectileLockModeRef = useRef<Map<string, 'LAZE' | 'UNIT' | 'FREE'>>(new Map());
  const projectileLockSwitchAtRef = useRef<Map<string, number>>(new Map());

  // 1 s clock: predicted projectile positions are time-based.
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const laze = lazeLayerRef.current.addTo(map);
    const proj = projectileLayerRef.current.addTo(map);
    return () => { laze.remove(); proj.remove(); };
  }, [map]);

  //  Active laser designations 
  useEffect(() => {
    lazeLayerRef.current.clearLayers();
    if (lazes.length === 0) return;

    const scale = 100 / worldSize;
    lazes.forEach(laze => {
      if (!Number.isFinite(laze.posX) || !Number.isFinite(laze.posY)) return;
      const ll: [number, number] = [laze.posY * scale, laze.posX * scale];
      const label = escapeHtml(lazeLabel(units[laze.unitId]));

      L.marker(ll, {
        pane: 'athena-laze',
        interactive: false,
        icon: L.divIcon({
          className: '',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          html: `<div style="position:relative;transform:translate(-50%,-50%);pointer-events:none;">`
            + `<div style="position:absolute;left:-14px;top:-14px;width:28px;height:28px;border:2px solid rgba(15,15,20,0.95);border-radius:50%;box-shadow:0 0 0 1px rgba(255,255,255,0.8),0 0 10px rgba(0,0,0,0.55);"></div>`
            + `<div style="position:absolute;left:-11px;top:-11px;width:22px;height:22px;border:2px solid rgba(255,96,96,0.98);border-radius:50%;box-shadow:0 0 10px rgba(255,72,72,0.85), inset 0 0 0 1px rgba(255,255,255,0.5);"></div>`
            + `<div style="position:absolute;left:-1px;top:-13px;width:2px;height:8px;background:rgba(255,96,96,1);"></div>`
            + `<div style="position:absolute;left:-1px;top:5px;width:2px;height:8px;background:rgba(255,96,96,1);"></div>`
            + `<div style="position:absolute;left:-13px;top:-1px;width:8px;height:2px;background:rgba(255,96,96,1);"></div>`
            + `<div style="position:absolute;left:5px;top:-1px;width:8px;height:2px;background:rgba(255,96,96,1);"></div>`
            + `<div style="position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;background:#fff;border:1px solid rgba(20,20,30,0.85);box-shadow:0 0 6px rgba(255,96,96,0.9);"></div>`
            + `<div style="position:absolute;left:20px;top:-11px;white-space:nowrap;font-size:10px;font-weight:700;color:#ffd1d1;padding:1px 5px;border-radius:4px;background:rgba(20,20,25,0.72);border:1px solid rgba(255,170,170,0.7);text-shadow:none;">${label}</div>`
            + `</div>`,
        }),
      }).addTo(lazeLayerRef.current);
    });
  }, [lazes, units, worldSize]);

  //  Simulated projectile tracking (prediction-only) 
  useEffect(() => {
    projectileLayerRef.current.clearLayers();
    if (firedEvents.length === 0) {
      onProjectileDebugChange?.([]);
      return;
    }

    const scale = 100 / worldSize;
    const now = clockMs;
    const activeKeys = new Set<string>();
    const debugEntries: ProjectileDebugEntry[] = [];

    // Deduplicate repeated events in the rolling fired queue
    const dedup = new Map<string, FiredEvent>();
    firedEvents.forEach(ev => {
      const key = `${ev.at}|${ev.unitId}|${ev.vehicleId}|${ev.weapon}|${ev.ammo}|${ev.projectile}`;
      if (!dedup.has(key)) dedup.set(key, ev);
    });

    // Build lookup of the most recent actual impact per shooter/weapon combination.
    // Key strategy is intentionally tolerant because Arma can report different unit IDs
    // for the same vehicle-fired shot (e.g. gunner/commander variants across handlers).
    const impactLookup = new Map<string, FiredImpactEvent>();
    for (const imp of firedImpacts) {
      const keys = [
        `${imp.unitId}|${imp.vehicleId}|${imp.weapon}|${imp.muzzle}`,
        `${imp.vehicleId}|${imp.weapon}|${imp.muzzle}`,
        `${imp.unitId}|${imp.weapon}|${imp.muzzle}`,
        `${imp.weapon}|${imp.muzzle}`,
      ];
      for (const k of keys) {
        const existing = impactLookup.get(k);
        if (!existing || Date.parse(imp.at) > Date.parse(existing.at)) {
          impactLookup.set(k, imp);
        }
      }
    }

    dedup.forEach((ev, key) => {
      const profile = getProjectileProfile(ev);
      if (!profile) return;

      const terminalUntil = projectileTerminalRef.current.get(key);
      if (terminalUntil !== undefined && terminalUntil > now) return;
      if (terminalUntil !== undefined && terminalUntil <= now) {
        projectileTerminalRef.current.delete(key);
      }

      const firedAt = Date.parse(ev.at);
      if (!Number.isFinite(firedAt)) return;

      const unit = units[ev.unitId];
      const vehicleByVehicleId = ev.vehicleId ? vehicles[ev.vehicleId] : undefined;
      const vehicleByUnitLink = unit?.vehicleId ? vehicles[unit.vehicleId] : undefined;
      // Some vehicle-fired events can report vehicle netId in unitId; support that shape too.
      const vehicleByUnitId = vehicles[ev.unitId];
      const vehicle = vehicleByVehicleId ?? vehicleByUnitLink ?? vehicleByUnitId;

      const srcX = vehicle?.posX ?? unit?.posX;
      const srcY = vehicle?.posY ?? unit?.posY;
      const eventDir = typeof ev.fireDir === 'number' && Number.isFinite(ev.fireDir) ? normDeg(ev.fireDir) : undefined;
      let dirDeg = normDeg(eventDir ?? vehicle?.dir ?? unit?.dir ?? 0);

      // If telemetry contains a concrete target point and heading points away from it,
      // flip heading by 180 for this event (some platforms report inverted weapon vectors).
      if (typeof ev.targetX === 'number' && Number.isFinite(ev.targetX) && typeof ev.targetY === 'number' && Number.isFinite(ev.targetY)) {
        const toTargetX = ev.targetX - srcX;
        const toTargetY = ev.targetY - srcY;
        const toTargetLen = Math.hypot(toTargetX, toTargetY);
        if (toTargetLen > 1) {
          const targetBearing = normDeg((Math.atan2(toTargetX, toTargetY) * 180) / Math.PI);
          if (shortestAngleDiff(dirDeg, targetBearing) > 90) {
            dirDeg = normDeg(dirDeg + 180);
          }
        }
      }

      if (profile.headingOffsetDeg) {
        dirDeg = normDeg(dirDeg + profile.headingOffsetDeg);
      }
      if (!Number.isFinite(srcX) || !Number.isFinite(srcY)) return;

      let launch = projectileLaunchRef.current.get(key);
      if (!launch) {
        launch = { x: srcX, y: srcY, dir: dirDeg };
        projectileLaunchRef.current.set(key, launch);
      }

      const shooterSide = unit?.side ?? 'UNKNOWN';
      let target: TargetEstimate | null = null;
      let lockMode: 'LAZE' | 'UNIT' | 'FREE' = profile.requiresLock ? 'UNIT' : 'FREE';
      if (profile.requiresLock) {
        const prevLockMode = projectileLockModeRef.current.get(key);
        const lastEtaSec = projectileLastEtaRef.current.get(key);
        if (profile.preferLiveLaze && prevLockMode === 'LAZE' && lazes.length === 0 && lastEtaSec !== undefined && lastEtaSec <= 3) {
          projectileTerminalRef.current.set(key, now + 5000);
          projectileLaunchRef.current.delete(key);
          projectileLockRef.current.delete(key);
          projectileLockModeRef.current.delete(key);
          projectileLockSwitchAtRef.current.delete(key);
          projectileLastEtaRef.current.delete(key);
          return;
        }

        let lock: GuidedLock | null = projectileLockRef.current.get(key) ?? null;
        if (!lock) {
          lock = acquireGuidedLock(ev, launch.x, launch.y, launch.dir, shooterSide, units, lazes, profile);
          if (lock) projectileLockRef.current.set(key, lock);
        }

        if (profile.preferLiveLaze && lock?.kind === 'unit' && lazes.length > 0) {
          const preferredLazeUnitId = findNearestLazeUnitId(launch.x, launch.y, launch.dir, ev.unitId, lazes, profile);
          if (preferredLazeUnitId) {
            lock = { kind: 'laze', unitId: preferredLazeUnitId };
            projectileLockRef.current.set(key, lock);
          }
        }

        if (lock) {
          lockMode = lock.kind === 'laze' ? 'LAZE' : 'UNIT';
          target = resolveGuidedLockTarget(lock, units, lazes, worldSize);
          if (!target) {
            // If the original lock vanished, try to reacquire while preserving lock type semantics.
            let reacquired: GuidedLock | null = null;
            if (lock.kind === 'laze') {
              if (typeof ev.targetX === 'number' && Number.isFinite(ev.targetX) && typeof ev.targetY === 'number' && Number.isFinite(ev.targetY)) {
                const byTargetPoint = findNearestLazeUnitIdByTargetPoint(ev.targetX, ev.targetY, lazes);
                if (byTargetPoint) {
                  reacquired = { kind: 'laze', unitId: byTargetPoint };
                }
              }
              if (!reacquired) {
                const lazeUnitId = findNearestLazeUnitId(launch.x, launch.y, launch.dir, ev.unitId, lazes, profile);
                if (lazeUnitId) {
                  reacquired = { kind: 'laze', unitId: lazeUnitId };
                }
              }
            } else {
              reacquired = acquireGuidedLock(ev, launch.x, launch.y, launch.dir, shooterSide, units, lazes, profile);
            }

            if (reacquired) {
              projectileLockRef.current.set(key, reacquired);
              lockMode = reacquired.kind === 'laze' ? 'LAZE' : 'UNIT';
              target = resolveGuidedLockTarget(reacquired, units, lazes, worldSize);
            }
          }
        }

        if (!target) {
          return;
        }
      } else {
        const grp = unit?.groupId ? groups[unit.groupId] : undefined;
        target = targetFromFiredEvent(ev)
          ?? targetFromLazes(launch.x, launch.y, launch.dir, ev.unitId, lazes, worldSize, profile)
          ?? estimateTarget(launch.x, launch.y, launch.dir, shooterSide, grp, units, worldSize, profile);
      }

      let dstX = target.x;
      let dstY = target.y;

      // For unguided weapons, use actual impact coordinates once the shell has landed.
      // The SQF tracker sends fired_impact 0.1 s after impact with the last-known position.
      // Also accept data from a previous shot of the same fire mission (same unit+weapon aimed
      // in the same direction) to correct the predicted range before the current shell lands.
      if (!profile.requiresLock) {
        const impactKeys = [
          `${ev.unitId}|${ev.vehicleId}|${ev.weapon}|${ev.muzzle}`,
          `${ev.vehicleId}|${ev.weapon}|${ev.muzzle}`,
          `${ev.unitId}|${ev.weapon}|${ev.muzzle}`,
          `${ev.weapon}|${ev.muzzle}`,
        ];
        const impact = impactKeys.map(k => impactLookup.get(k)).find((v): v is FiredImpactEvent => !!v);
        if (impact) {
          const impactReceivedAt = Date.parse(impact.at);
          const impactAge = now - impactReceivedAt;
          // Current shot: impact arrived after firing with wall-clock delta  TOF
          const isCurrentShot = impactReceivedAt > firedAt &&
              Math.abs((impactReceivedAt - firedAt) - impact.timeOfFlight * 1000) < 10_000;
          // Previous shot, same fire mission: recent (<10 min) and aimed in the same direction (<25)
          const toImpactX = impact.impactX - launch.x;
          const toImpactY = impact.impactY - launch.y;
          const impactBearing = normDeg((Math.atan2(toImpactX, toImpactY) * 180) / Math.PI);
          const isPrevShot = !isCurrentShot && impactAge < 600_000 &&
              shortestAngleDiff(dirDeg, impactBearing) < 25;
          if (isCurrentShot || isPrevShot) {
            dstX = impact.impactX;
            dstY = impact.impactY;
          }
        }
      }

      if (!Number.isFinite(dstX) || !Number.isFinite(dstY)) return;

      const distance = Math.hypot(dstX - launch.x, dstY - launch.y);
      if (distance < 5) return;

      const launchAt = firedAt + profile.launchDelayMs;
      if (now < launchAt) return;

      // The ballistic model gives a more accurate ETA for artillery/rockets whose
      // time-of-flight is non-linear with range (high arc at short range, flat at long).
      // Fallback to fixed-speed formula for non-ballistic profiles (missiles, etc.).
      // For unguided weapons, prefer the actual TOF from the fired_impact report.
      let etaMs: number;
      if (!profile.requiresLock) {
        const impactKeys = [
          `${ev.unitId}|${ev.vehicleId}|${ev.weapon}|${ev.muzzle}`,
          `${ev.vehicleId}|${ev.weapon}|${ev.muzzle}`,
          `${ev.unitId}|${ev.weapon}|${ev.muzzle}`,
          `${ev.weapon}|${ev.muzzle}`,
        ];
        const impact = impactKeys.map(k => impactLookup.get(k)).find((v): v is FiredImpactEvent => !!v);
        if (impact) {
          const impactReceivedAt = Date.parse(impact.at);
          const impactAge = now - impactReceivedAt;
          const isCurrentShot = impactReceivedAt > firedAt &&
              Math.abs((impactReceivedAt - firedAt) - impact.timeOfFlight * 1000) < 10_000;
          const toImpactX = impact.impactX - launch.x;
          const toImpactY = impact.impactY - launch.y;
          const impactBearing = normDeg((Math.atan2(toImpactX, toImpactY) * 180) / Math.PI);
          const isPrevShot = !isCurrentShot && impactAge < 600_000 &&
              shortestAngleDiff(dirDeg, impactBearing) < 25;
          if (isCurrentShot || isPrevShot) {
            etaMs = impact.timeOfFlight * 1000;
          } else {
            etaMs = (profile.useBallistics && profile.ballA && profile.ballB)
              ? profile.ballA * Math.pow(Math.max(distance, 1), profile.ballB) * 1000
              : (distance / Math.max(profile.speedMps, 1)) * 1000;
          }
        } else {
          etaMs = (profile.useBallistics && profile.ballA && profile.ballB)
            ? profile.ballA * Math.pow(Math.max(distance, 1), profile.ballB) * 1000
            : (distance / Math.max(profile.speedMps, 1)) * 1000;
        }
      } else {
        etaMs = (profile.useBallistics && profile.ballA && profile.ballB)
          ? profile.ballA * Math.pow(Math.max(distance, 1), profile.ballB) * 1000
          : (distance / Math.max(profile.speedMps, 1)) * 1000;
      }
      const impactAt = launchAt + etaMs;
      const expiresAt = impactAt + profile.lingerAfterImpactMs;
      if (now >= expiresAt) return;

      const progress = clamp((now - launchAt) / etaMs, 0, 1);
      const worldPts = buildPredictedPath(launch.x, launch.y, dstX, dstY, profile.lateralFactor, progress);
      const mapPts = worldPts.map(([x, y]) => [y * scale, x * scale] as [number, number]);
      if (mapPts.length < 2) return;
      activeKeys.add(key);

      L.polyline(mapPts, {
        color: profile.color,
        weight: 2.2,
        opacity: 1,
        dashArray: '6,5',
        interactive: false,
        pane: 'athena-projectile',
      }).addTo(projectileLayerRef.current);

      const cur = mapPts[mapPts.length - 1];
  const etaSec = Math.max(0, Math.ceil((impactAt - now) / 1000));
      projectileLastEtaRef.current.set(key, etaSec);
      const sourceTag = projectileSourceTag(target);
      const shooterName = unit ? (unit.playerName?.trim() || unit.name || unit.id) : ev.unitId;
      const weaponLabel = ev.weapon?.trim() || ev.projectile?.trim() || ev.ammo?.trim() || 'Unknown';
      debugEntries.push({
        id: key.slice(-8),
        trackKey: key,
        shooter: shooterName,
        weapon: weaponLabel,
        lock: lockMode,
        source: sourceTag,
        etaSec,
        target: `${Math.round(dstX)},${Math.round(dstY)}`,
        lockSwitched: false,
      });

      L.marker(cur, {
        pane: 'athena-projectile',
        interactive: false,
        icon: L.divIcon({
          className: '',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          html: `<div style="width:8px;height:8px;border-radius:50%;background:${profile.color};box-shadow:0 0 6px ${profile.color};"></div>` +
            `<div style="margin-top:2px;white-space:nowrap;font-size:9px;font-weight:700;color:${profile.color};text-shadow:-1px 0 #000,1px 0 #000,0 -1px #000,0 1px #000;">${sourceTag} ETA ${etaSec}s</div>`,
        }),
      }).addTo(projectileLayerRef.current);
    });

    // Drop cached launch points for projectiles that are no longer active.
    for (const key of projectileLaunchRef.current.keys()) {
      if (!activeKeys.has(key)) projectileLaunchRef.current.delete(key);
    }
    for (const key of projectileLockRef.current.keys()) {
      if (!activeKeys.has(key)) projectileLockRef.current.delete(key);
    }
    for (const key of projectileLastEtaRef.current.keys()) {
      if (!activeKeys.has(key)) projectileLastEtaRef.current.delete(key);
    }
    for (const key of projectileTerminalRef.current.keys()) {
      if (projectileTerminalRef.current.get(key)! <= now) projectileTerminalRef.current.delete(key);
    }
    for (const key of projectileLockModeRef.current.keys()) {
      if (!activeKeys.has(key)) projectileLockModeRef.current.delete(key);
    }
    for (const key of projectileLockSwitchAtRef.current.keys()) {
      if (!activeKeys.has(key)) projectileLockSwitchAtRef.current.delete(key);
    }

    const switchFlashMs = 2500;
    const debugWithSwitch = debugEntries.map(entry => {
      const prev = projectileLockModeRef.current.get(entry.trackKey);
      const current = entry.lock;
      if (prev && prev !== current) {
        projectileLockSwitchAtRef.current.set(entry.trackKey, now);
      }
      projectileLockModeRef.current.set(entry.trackKey, current);

      const switchedAt = projectileLockSwitchAtRef.current.get(entry.trackKey);
      const lockSwitched = switchedAt !== undefined && now - switchedAt <= switchFlashMs;
      return {
        ...entry,
        lockSwitched,
      };
    });

    onProjectileDebugChange?.(debugWithSwitch.slice(0, 5));
  }, [firedEvents, firedImpacts, units, vehicles, groups, lazes, worldSize, clockMs, onProjectileDebugChange]);

  return null;
}

/**
 * How long (ms) a unit keeps the "just fired" pulse after a Fired event.
 * Same value as AR's original map code.
 */
const FIRING_PULSE_WINDOW_MS = 2200;

/**
 * Unit ids that fired within the last FIRING_PULSE_WINDOW_MS, for AthenaMap's
 * `pulseUnitIds`. Re-evaluated once per second.
 */
export function useRecentShooterIds(firedEvents: FiredEvent[]): Set<string> {
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(() => {
    const set = new Set<string>();
    firedEvents.forEach(ev => {
      if (!ev.unitId) return;
      const atMs = Date.parse(ev.at);
      if (!Number.isFinite(atMs)) return;
      const age = clockMs - atMs;
      if (age >= 0 && age <= FIRING_PULSE_WINDOW_MS) set.add(ev.unitId);
    });
    return set;
  }, [firedEvents, clockMs]);
}

/** Fire Control panel (top-right over the map) listing live projectile tracks. */
export function FireControlPanel({ entries: projectileDebugEntries }: { entries: ProjectileDebugEntry[] }) {
  if (projectileDebugEntries.length === 0) return null;
  return (
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 58,
          zIndex: 1200,
          pointerEvents: 'none',
          minWidth: 320,
          maxWidth: 420,
          background: 'linear-gradient(180deg, rgba(30,40,26,0.88), rgba(12,18,12,0.92))',
          border: '1px solid rgba(193,214,160,0.55)',
          boxShadow: '0 0 0 1px rgba(12,18,10,0.7), 0 8px 18px rgba(0,0,0,0.45)',
          color: '#D9EBC2',
          borderRadius: 6,
          fontFamily: 'Consolas, "Lucida Console", monospace',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 10px',
            fontSize: 11,
            letterSpacing: 1,
            background: 'rgba(162,189,120,0.12)',
            borderBottom: '1px solid rgba(193,214,160,0.35)',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          <span>Fire Control</span>
          <span style={{ color: '#FFCD7E' }}>Track Live</span>
        </div>
        <div style={{ padding: '6px 8px 8px 8px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.7fr 0.8fr 0.8fr 0.7fr 1fr',
              columnGap: 8,
              fontSize: 10,
              opacity: 0.78,
              padding: '0 2px 5px 2px',
              borderBottom: '1px dashed rgba(193,214,160,0.25)',
              marginBottom: 4,
            }}
          >
            <span>Callsign</span>
            <span>Lock</span>
            <span>Src</span>
            <span>ETA</span>
            <span>Target</span>
          </div>
          {projectileDebugEntries.map(entry => (
            <div
              key={entry.trackKey}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.7fr 0.8fr 0.8fr 0.7fr 1fr',
                columnGap: 8,
                fontSize: 11,
                padding: '3px 2px',
                borderBottom: '1px solid rgba(193,214,160,0.10)',
                background: entry.lockSwitched ? 'linear-gradient(90deg, rgba(255,94,94,0.22), rgba(255,180,120,0.04))' : 'transparent',
              }}
            >
              <span style={{ color: '#E8F4D1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`${entry.shooter} · ${entry.weapon}`}>{entry.shooter}</span>
              <span style={{ color: entry.lock === 'LAZE' ? '#FF9B9B' : entry.lock === 'UNIT' ? '#FFC778' : '#A9D3FF', fontWeight: 700 }}>{entry.lock}</span>
              <span>{entry.source}</span>
              <span>{entry.etaSec}s</span>
              <span>{entry.target}{entry.lockSwitched ? ' SW' : ''}</span>
            </div>
          ))}
        </div>
      </div>
  );
}
