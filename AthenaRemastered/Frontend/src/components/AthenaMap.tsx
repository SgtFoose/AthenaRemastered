import { MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Unit, Vehicle, Group, Road, ForestsData, MapLocation, MapStructure, ElevationsData, ContourLine } from '../types/game';
import { API_BASE } from '../apiBase';
import 'leaflet/dist/leaflet.css';

// Arma uses a square world coordinate system [0..worldSize].
// We project it onto Leaflet CRS.Simple with a normalised 0â€“100 space.
// Y is flipped so "North" (higher Y in Arma) appears at the top.

// Side â†’ colour matching Arma 3 faction conventions
function sideColor(side: string): string {
  switch (side.toLowerCase()) {
    case 'west':     return '#4e9de0'; // BLUFOR â€“ blue
    case 'east':     return '#d93b3b'; // OPFOR  â€“ red
    case 'guer':     return '#4ec94e'; // INDFOR â€“ green
    case 'civilian': return '#9b59b6'; // CIV    â€“ purple
    default:         return '#cccccc';
  }
}

// â”€â”€ Road styling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function roadStyle(type: string, foot: boolean): { color: string; weight: number } | null {
  if (foot) return null;  // skip footpaths
  switch (type.toLowerCase()) {
    case '':           return { color: '#D8CC9A', weight: 7.0  };  // primary — warm yellow
    case 'road':       return { color: '#D8CC9A', weight: 7.0  };  // primary — warm yellow
    case 'main road':  return { color: '#D8CC9A', weight: 5.0  };  // main — warm yellow
    case 'track':      return { color: '#9E907E', weight: 3.0  };  // track
    case 'hide':       return { color: '#8c959e', weight: 2.0  };  // airport surfaces
    default:           return { color: '#9E907E', weight: 3.0  };
  }
}

function rotatedRoadRect(road: Road, scale: number): [number, number][] {
  // For "hide" roads (airport surfaces), use the object centre from getPosASL;
  // beg1/end2 from getRoadInfo are road-segment endpoints and wrong for area objects.
  // Fall back to midpoint of beg/end for old cached data lacking posX/posY.
  const cx = (road.posX ? road.posX : (road.beg1X + road.end2X) / 2) * scale;
  const cy = (road.posY ? road.posY : (road.beg1Y + road.end2Y) / 2) * scale;
  // Pad each tile by 1m so adjacent 20×20 tiles overlap slightly, hiding
  // sub-pixel gaps from floating-point position/rotation precision.
  const pad = 1;
  const halfWidth = ((road.width + pad) / 2) * scale;
  const halfLength = ((road.length + pad) / 2) * scale;
  const angle = (road.dir * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);

  const corners: [number, number][] = [
    [-halfWidth, -halfLength],
    [halfWidth, -halfLength],
    [halfWidth, halfLength],
    [-halfWidth, halfLength],
  ].map(([dx, dy]) => [
    cy + dx * sin + dy * cos,
    cx + dx * cos - dy * sin,
  ]);

  return corners;
}

function rotatedStructureRect(s: MapStructure, scale: number): [number, number][] {
  const cx = s.posX * scale;
  const cy = s.posY * scale;
  const halfWidth = (s.width / 2) * scale;
  const halfLength = (s.length / 2) * scale;
  const angle = (s.dir * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);

  return [
    [-halfWidth, -halfLength],
    [halfWidth, -halfLength],
    [halfWidth, halfLength],
    [-halfWidth, halfLength],
  ].map(([dx, dy]) => [
    cy + dx * sin + dy * cos,
    cx + dx * cos - dy * sin,
  ]);
}

// Forest fill colours — Bus's two-flavour palette: solid squares, no gradient.
const FOREST_RGBA: [number,number,number,number][] = [
  [  0,   0,   0,  0.00],  // 0: empty
  [188, 222, 180,  1.00],  // 1: light/sparse  — #BCDEB4
  [188, 222, 180,  1.00],  // 2: medium        — #BCDEB4
  [ 35,  66,  36,  1.00],  // 3: dense/heavy   — #234224
];

// â”€â”€ Unit icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Match Athena Desktop Unit.GetMarkerType() logic exactly.
function unitIconFile(unit: Unit): string {
  const t = (unit.type ?? '').trim().toLowerCase();
  const r = (unit.rank ?? '').toLowerCase();
  // Rank >= Lieutenant → officer
  if (/colonel|major|captain|lieutenant/.test(r)) return 'iconmanofficer';
  // Squad/team leader
  if (t.includes('_sl') || t.includes('_tl_')) return 'iconmanleader';
  // Medic
  if (t.includes('medic') || unit.hasMediKit) return 'iconmanmedic';
  // Engineer
  if (t.includes('engineer')) return 'iconmanengineer';
  // Weapons (primary then secondary)
  const w1 = (unit.weaponPrimary ?? '').toLowerCase();
  const w2 = (unit.weaponSecondary ?? '').toLowerCase();
  if (w1 === 'machinegun' || w2 === 'machinegun') return 'iconmanmg';
  if (/rocketlauncher|missilelauncher/.test(w1) || /rocketlauncher|missilelauncher/.test(w2)) return 'iconmanat';
  return 'iconman';
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function unitLabel(unit: Unit): string {
  if (unit.playerName?.trim()) return unit.playerName.trim();
  return unit.name?.trim() || unit.type;
}

// Match Athena Desktop: just the tinted PNG icon, rotated by direction, no circle/arrow.
function unitIcon(unit: Unit): L.DivIcon {
  const color    = sideColor(unit.side);
  const isPlayer = unit.playerName !== '';
  const size     = isPlayer ? 34 : 28;
  const icon     = unitIconFile(unit);
  const dir      = Number.isFinite(unit.dir) ? unit.dir : 0;
  const label = escapeHtml(unitLabel(unit));
  const html = `<div class="map-marker-wrap ${isPlayer ? 'map-marker-player' : 'map-marker-unit'}">
    <div style="width:${size}px;height:${size}px;` +
    `background-color:${color};` +
    `-webkit-mask-image:url(/icons/vehicles/${icon}.png);` +
    `mask-image:url(/icons/vehicles/${icon}.png);` +
    `-webkit-mask-size:contain;mask-size:contain;` +
    `-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;` +
    `-webkit-mask-position:center;mask-position:center;` +
    `transform:rotate(${dir}deg);transform-origin:center;` +
    `filter:drop-shadow(1px 0 0 rgba(0,0,0,0.5)) drop-shadow(-1px 0 0 rgba(0,0,0,0.5)) drop-shadow(0 1px 0 rgba(0,0,0,0.5)) drop-shadow(0 -1px 0 rgba(0,0,0,0.5));` +
    `"></div>
    <div class="map-marker-label">${label}</div>
  </div>`;
  return L.divIcon({ className: '', iconSize: [size, size + 12], iconAnchor: [size / 2, size / 2], html });
}

// Resolve APP-6 / NATO icon type from group members' vehicle classes and unit types.
function resolveGroupType(members: Unit[], vehicles: Record<string, Vehicle>, vehicleMap: Map<string, string>): string {
  const mountedVeh = members.map(u => u.vehicleId ? vehicles[u.vehicleId] : undefined).find(v => v);
  if (mountedVeh) {
    const cat = resolveVehicleCategory(mountedVeh.class, vehicleMap);
    switch (cat) {
      case 'Planes': return 'plane';
      case 'Helicopters': return 'air';
      case 'Tanks': return 'armor';
      case 'APCs': return 'mech_inf';
      case 'Cars': return 'motor_inf';
      case 'Drones': return 'uav';
      case 'Artillery': return 'art';
      case 'AAs': return 'art';
      case 'Boats': case 'Submersibles': return 'naval';
      case 'Turrets': return 'mortar';
    }
    const cls = mountedVeh.class.toLowerCase();
    if (cls.includes('uav') || cls.includes('ugv')) return 'uav';
    if (cls.includes('plane') || cls.includes('jet')) return 'plane';
    if (cls.includes('heli')) return 'air';
    if (cls.includes('tank') || cls.includes('mbt')) return 'armor';
    if (cls.includes('apc') || cls.includes('ifv')) return 'mech_inf';
    return 'motor_inf';
  }
  const types = members.map(u => u.type.toLowerCase()).join(' ');
  if (/medic|corpsman/.test(types)) return 'med';
  if (/sniper|marksman|recon|spotter/.test(types)) return 'recon';
  if (/officer|commander|jtac/.test(types)) return 'hq';
  return 'inf';
}

// Resolve NATO marker filename prefix from side (Desktop: CIV/GUER/UNKNOWN all use 'n').
function natoSidePrefix(side: string): string {
  switch (side.toLowerCase()) {
    case 'west': return 'b';
    case 'east': return 'o';
    default:     return 'n';
  }
}

function shortRank(rank: string): string {
  const r = rank.toLowerCase();
  if (r.includes('private'))   return 'Pvt';
  if (r.includes('corporal'))  return 'Cpl';
  if (r.includes('sergeant'))  return 'Sgt';
  if (r.includes('lieutenant'))return 'Lt';
  if (r.includes('captain'))   return 'Capt';
  if (r.includes('major'))     return 'Maj';
  if (r.includes('colonel'))   return 'Col';
  if (r === '' || r === 'none') return '';
  return rank;
}

// ── Waypoint line styling per type ───────────────────────────────────────────
function waypointStyle(wpType: string): { color: string; endColor: string; endIcon: string } {
  const t = wpType.toUpperCase();
  // Attack / aggressive types — red
  if (t === 'DESTROY' || t === 'SAD' || t === 'SEEK AND DESTROY' || t === 'ATTACK')
    return { color: '#d32f2f', endColor: '#d32f2f', endIcon: '<line x1="4" y1="4" x2="10" y2="10" stroke="#fff" stroke-width="1.5"/><line x1="10" y1="4" x2="4" y2="10" stroke="#fff" stroke-width="1.5"/>' };
  // Guard / support — amber
  if (t === 'GUARD' || t === 'SUPPORT')
    return { color: '#f9a825', endColor: '#f9a825', endIcon: '' };
  // Get in / board — blue
  if (t === 'GETIN' || t === 'GET IN' || t === 'GETOUT' || t === 'GET OUT' || t === 'LOAD' || t === 'UNLOAD')
    return { color: '#1976d2', endColor: '#1976d2', endIcon: '' };
  // Sentry / hold — purple
  if (t === 'SENTRY' || t === 'HOLD')
    return { color: '#9c27b0', endColor: '#9c27b0', endIcon: '' };
  // Move / default — dark grey
  return { color: '#333', endColor: '#aaa', endIcon: '' };
}

// Use actual NATO marker PNGs from Athena Desktop, color-tinted via CSS mask.
function groupIcon(side: string, _unitCount: number, groupType: string): L.DivIcon {
  const color = sideColor(side);
  const prefix = natoSidePrefix(side);
  const size = 48;
  const natoFile = `/icons/nato/${prefix}_${groupType}.png`;
  const html = `<div style="width:${size}px;height:${size}px;` +
    `background-color:${color};` +
    `-webkit-mask-image:url(${natoFile});` +
    `mask-image:url(${natoFile});` +
    `-webkit-mask-size:contain;mask-size:contain;` +
    `-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;` +
    `-webkit-mask-position:center;mask-position:center;` +
    `filter:drop-shadow(1px 0 0 rgba(0,0,0,0.55)) drop-shadow(-1px 0 0 rgba(0,0,0,0.55)) drop-shadow(0 1px 0 rgba(0,0,0,0.55)) drop-shadow(0 -1px 0 rgba(0,0,0,0.55));` +
    `"></div>`;
  return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html });
}

function groupLabel(group: Group): string {
  return (group.name || 'GROUP').trim();
}

function resolveVehicleCategory(vehicleClass: string, vehicleMap: Map<string, string>): string {
  const mapped = vehicleMap.get(vehicleClass);
  if (mapped) return mapped;

  const text = vehicleClass.toLowerCase();
  if (text.includes('plane') || text.includes('jet')) return 'Planes';
  if (text.includes('heli')) return 'Helicopters';
  if (text.includes('uav') || text.includes('ugv') || text.includes('drone')) return 'Drones';
  if (text.includes('sub') || text.includes('sdv')) return 'Submersibles';
  if (text.includes('boat') || text.includes('ship')) return 'Boats';
  if (text.includes('tank') || text.includes('mbt')) return 'Tanks';
  if (text.includes('apc') || text.includes('tracked')) return 'APCs';
  if (text.includes('aa')) return 'AAs';
  if (text.includes('mortar') || text.includes('art') || text.includes('mlrs')) return 'Artillery';
  if (text.includes('turret')) return 'Turrets';
  if (text.includes('car') || text.includes('mrap') || text.includes('truck') || text.includes('quadbike')) return 'Cars';
  if (/mine|slam|claymore|explosive|ied|satchel|demo_charge/.test(text)) return 'Mines';
  return '';
}

// ── Vehicle subtype resolution ───────────────────────────────────────────

function resolveDroneSubtype(vehicleClass: string): string {
  const t = vehicleClass.toLowerCase();
  if (t.includes('uav_05'))                         return 'sentinel';    // flying-wing UCAV
  if (t.includes('uav_02') || t.includes('uav_04')) return 'fixedwing';   // Greyhawk / YABHON-R3
  if (t.includes('ugv_01'))                         return 'ugv_tracked'; // Stomper
  if (t.includes('ugv_02') || t.includes('uav_06')) return 'ugv_wheeled'; // ED-1D / Pelican
  return 'quadcopter';
}

function resolveHeliSubtype(vehicleClass: string): string {
  const t = vehicleClass.toLowerCase();
  if (t.includes('heli_attack'))                    return 'attack';      // AH-99 Blackfoot / Mi-48
  if (t.includes('heli_transport_03'))              return 'heavy';       // CH-67 Huron (Chinook)
  if (t.includes('vtol'))                           return 'tiltrotor';   // V-44 Blackfish
  if (t.includes('heli_light'))                     return 'light';       // MH-9 / Orca
  return 'transport';                                                     // Ghost Hawk / Mohawk
}

function resolveAPCSubtype(vehicleClass: string): string {
  const t = vehicleClass.toLowerCase();
  if (t.includes('wheeled'))                        return 'wheeled';     // Marshall / Marid / Gorgon
  return 'tracked';                                                       // Panther / Mora / BMP
}

function resolveBoatSubtype(vehicleClass: string): string {
  const t = vehicleClass.toLowerCase();
  if (t.includes('ship'))                           return 'ship';        // destroyer
  if (t.includes('boat_armed'))                     return 'armed';       // speedboat HMG/minigun
  if (t.includes('boat_civil'))                     return 'civilian';    // civilian speedboat
  return 'transport';                                                     // assault boat / RHIB
}

function resolveTurretSubtype(vehicleClass: string): string {
  const t = vehicleClass.toLowerCase();
  if (t.includes('sam_system'))                     return 'sam';         // SAM launcher
  if (t.includes('aaa_system'))                     return 'aaa';        // Praetorian AA
  if (t.includes('radar'))                          return 'radar';       // AN/MPQ / R-750
  if (t.includes('ship_gun') || t.includes('ship_mrls')) return 'naval'; // ship-mounted weapons
  if (t.includes('mortar'))                         return 'mortar';      // Mk6 mortar
  if (t.includes('gmg'))                            return 'gmg';        // grenade MG
  return 'hmg';                                                           // default HMG / static
}

// â”€â”€ Vehicle icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


function categoryToIconFile(category: string, vehicleClass?: string): string {
  const cl = (vehicleClass ?? '').toLowerCase();
  switch (category) {
    case 'Cars':          return cl.includes('truck') ? 'icontruck' : cl.includes('motorcycle') ? 'iconmotorcycle' : 'iconcar';
    case 'APCs':          return 'iconapc';
    case 'Tanks':         return 'icontank';
    case 'Helicopters':   return 'iconhelicopter';
    case 'Planes':        return 'iconplane';
    case 'Boats':         return 'iconship';
    case 'Artillery':     return 'iconstaticcannon';
    case 'AAs':           return 'iconapc';  // Desktop: AAs inherit tank/APC, show as APC
    case 'Submersibles':  return 'iconship';
    case 'Drones':        return 'iconplane'; // Desktop: drones use plane icon
    case 'Turrets':       return 'iconstaticmg';
    default:              return 'iconvehicle';
  }
}

function vehicleIconHtml(category: string, color: string, dir: number, size: number, vehicleClass?: string): string {
  const icon = categoryToIconFile(category, vehicleClass);
  return `<div style="width:${size}px;height:${size}px;` +
    `background-color:${color};` +
    `-webkit-mask-image:url(/icons/vehicles/${icon}.png);` +
    `mask-image:url(/icons/vehicles/${icon}.png);` +
    `-webkit-mask-size:contain;mask-size:contain;` +
    `-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;` +
    `-webkit-mask-position:center;mask-position:center;` +
    `transform:rotate(${dir}deg);transform-origin:center;` +
    `filter:drop-shadow(1px 0 0 rgba(0,0,0,0.6)) drop-shadow(-1px 0 0 rgba(0,0,0,0.6)) drop-shadow(0 1px 0 rgba(0,0,0,0.6)) drop-shadow(0 -1px 0 rgba(0,0,0,0.6));` +
    `"></div>`;
}

function vehicleSvg(category: string, color: string, dir: number, vehicleClass?: string): string {
  const s = 'rgba(0,0,0,0.75)';
  const sw = '1.2';
  const wrap = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 40 40"` +
    ` style="display:block;transform:rotate(${dir}deg);transform-origin:center;">${body}</svg>`;
  switch (category) {
    case 'Cars':
      // Realistic top-view car: body with rounded hood and rear, wheel arches
      return wrap(
        `<rect x="12" y="6" width="16" height="28" rx="5" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
        `<rect x="10" y="10" width="3" height="5" rx="1" fill="#222"/>` +  // left front wheel
        `<rect x="27" y="10" width="3" height="5" rx="1" fill="#222"/>` +  // right front wheel
        `<rect x="10" y="25" width="3" height="5" rx="1" fill="#222"/>` +  // left rear wheel
        `<rect x="27" y="25" width="3" height="5" rx="1" fill="#222"/>` +  // right rear wheel
        `<rect x="15" y="11" width="10" height="6" rx="1.5" fill="rgba(180,220,255,0.5)" stroke="${s}" stroke-width="0.5"/>`  // windshield
      );
    case 'APCs': {
      const sub = resolveAPCSubtype(vehicleClass ?? '');
      if (sub === 'wheeled') {
        // Wheeled APC (Marshall / Marid / Gorgon): boxy hull, 4 wheels, turret
        return wrap(
          `<rect x="10" y="4" width="20" height="32" rx="3" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
          `<circle cx="10" cy="10" r="3.5" fill="#333" stroke="${s}" stroke-width="0.5"/>` +   // left front wheel
          `<circle cx="30" cy="10" r="3.5" fill="#333" stroke="${s}" stroke-width="0.5"/>` +   // right front wheel
          `<circle cx="10" cy="20" r="3.5" fill="#333" stroke="${s}" stroke-width="0.5"/>` +   // left mid wheel
          `<circle cx="30" cy="20" r="3.5" fill="#333" stroke="${s}" stroke-width="0.5"/>` +   // right mid wheel
          `<circle cx="10" cy="30" r="3.5" fill="#333" stroke="${s}" stroke-width="0.5"/>` +   // left rear wheel
          `<circle cx="30" cy="30" r="3.5" fill="#333" stroke="${s}" stroke-width="0.5"/>` +   // right rear wheel
          `<circle cx="20" cy="16" r="5" fill="${color}" stroke="${s}" stroke-width="1.2"/>` +
          `<line x1="20" y1="11" x2="20" y2="2" stroke="${s}" stroke-width="2.5"/>`
        );
      }
      // Tracked APC (Panther / Mora): boxy hull, tracks, small turret
      return wrap(
        `<rect x="9" y="4" width="22" height="32" rx="3" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
        `<rect x="7" y="7" width="4" height="6" rx="1" fill="#333"/>` +
        `<rect x="29" y="7" width="4" height="6" rx="1" fill="#333"/>` +
        `<rect x="7" y="27" width="4" height="6" rx="1" fill="#333"/>` +
        `<rect x="29" y="27" width="4" height="6" rx="1" fill="#333"/>` +
        `<circle cx="20" cy="16" r="5" fill="${color}" stroke="${s}" stroke-width="1.2"/>` +
        `<line x1="20" y1="11" x2="20" y2="2" stroke="${s}" stroke-width="2.5"/>`
      );
    }
    case 'Tanks':
      // Main battle tank: wide hull with tracks, large turret, long barrel
      return wrap(
        `<rect x="6" y="5" width="28" height="30" rx="2" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
        `<rect x="4" y="6" width="5" height="28" rx="1.5" fill="#333" stroke="${s}" stroke-width="0.6"/>` +  // left track
        `<rect x="31" y="6" width="5" height="28" rx="1.5" fill="#333" stroke="${s}" stroke-width="0.6"/>` + // right track
        `<circle cx="20" cy="20" r="7" fill="${color}" stroke="${s}" stroke-width="1.4"/>` +
        `<line x1="20" y1="13" x2="20" y2="1" stroke="${s}" stroke-width="3"/>`
      );
    case 'Helicopters': {
      const sub = resolveHeliSubtype(vehicleClass ?? '');
      switch (sub) {
        case 'attack':
          // Attack helicopter: narrow fuselage, stub wings, aggressive profile
          return wrap(
            `<ellipse cx="20" cy="20" rx="4" ry="11" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<line x1="16" y1="18" x2="8" y2="16" stroke="${color}" stroke-width="3"/>` +   // left stub wing
            `<line x1="24" y1="18" x2="32" y2="16" stroke="${color}" stroke-width="3"/>` +   // right stub wing
            `<line x1="16" y1="18" x2="8" y2="16" stroke="${s}" stroke-width="0.8"/>` +
            `<line x1="24" y1="18" x2="32" y2="16" stroke="${s}" stroke-width="0.8"/>` +
            `<line x1="20" y1="31" x2="20" y2="38" stroke="${s}" stroke-width="1.5"/>` +     // tail boom
            `<line x1="16" y1="37" x2="24" y2="37" stroke="${s}" stroke-width="1.2"/>` +     // tail rotor
            `<circle cx="20" cy="20" r="14" fill="none" stroke="${s}" stroke-width="0.6" stroke-dasharray="3 3"/>` +
            `<line x1="6" y1="20" x2="34" y2="20" stroke="${s}" stroke-width="0.8"/>`
          );
        case 'heavy':
          // Heavy transport (Chinook style): wide body, tandem rotors
          return wrap(
            `<rect x="14" y="6" width="12" height="28" rx="6" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<circle cx="20" cy="10" r="10" fill="none" stroke="${s}" stroke-width="0.6" stroke-dasharray="3 3"/>` +
            `<line x1="10" y1="10" x2="30" y2="10" stroke="${s}" stroke-width="0.8"/>` +
            `<circle cx="20" cy="30" r="10" fill="none" stroke="${s}" stroke-width="0.6" stroke-dasharray="3 3"/>` +
            `<line x1="10" y1="30" x2="30" y2="30" stroke="${s}" stroke-width="0.8"/>`
          );
        case 'tiltrotor':
          // Tiltrotor (V-44 Blackfish): wide fuselage, two engine nacelles at wingtips
          return wrap(
            `<ellipse cx="20" cy="20" rx="5" ry="12" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<line x1="8" y1="18" x2="32" y2="18" stroke="${color}" stroke-width="3.5"/>` +  // wing
            `<line x1="8" y1="18" x2="32" y2="18" stroke="${s}" stroke-width="0.8"/>` +
            `<circle cx="8" cy="18" r="5" fill="none" stroke="${s}" stroke-width="0.6" stroke-dasharray="2 2"/>` +  // left rotor
            `<circle cx="32" cy="18" r="5" fill="none" stroke="${s}" stroke-width="0.6" stroke-dasharray="2 2"/>` + // right rotor
            `<polygon points="20,30 27,36 13,36" fill="${color}" stroke="${s}" stroke-width="0.8"/>`  // tail
          );
        case 'light':
          // Light helicopter: small open-frame body, skids
          return wrap(
            `<ellipse cx="20" cy="19" rx="5" ry="7" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<line x1="20" y1="26" x2="20" y2="36" stroke="${s}" stroke-width="1"/>` +       // tail boom
            `<line x1="17" y1="35" x2="23" y2="35" stroke="${s}" stroke-width="0.8"/>` +     // tail rotor
            `<line x1="12" y1="24" x2="12" y2="28" stroke="${s}" stroke-width="0.8"/>` +     // left skid strut
            `<line x1="28" y1="24" x2="28" y2="28" stroke="${s}" stroke-width="0.8"/>` +     // right skid strut
            `<line x1="10" y1="28" x2="14" y2="28" stroke="${s}" stroke-width="1"/>` +       // left skid
            `<line x1="26" y1="28" x2="30" y2="28" stroke="${s}" stroke-width="1"/>` +       // right skid
            `<circle cx="20" cy="19" r="13" fill="none" stroke="${s}" stroke-width="0.6" stroke-dasharray="3 3"/>` +
            `<line x1="7" y1="19" x2="33" y2="19" stroke="${s}" stroke-width="0.8"/>`
          );
        default:
          // Standard transport helicopter
          return wrap(
            `<ellipse cx="20" cy="20" rx="6" ry="10" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<line x1="20" y1="30" x2="20" y2="38" stroke="${s}" stroke-width="1.5"/>` +
            `<line x1="16" y1="37" x2="24" y2="37" stroke="${s}" stroke-width="1.2"/>` +
            `<circle cx="20" cy="20" r="14" fill="none" stroke="${s}" stroke-width="0.6" stroke-dasharray="3 3"/>` +
            `<line x1="6" y1="20" x2="34" y2="20" stroke="${s}" stroke-width="0.8"/>`
          );
      }
    }
    case 'Planes':
      // Fixed-wing aircraft: fuselage, swept wings, tail
      return wrap(
        `<ellipse cx="20" cy="18" rx="3.5" ry="14" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
        `<polygon points="20,12 38,22 20,19 2,22" fill="${color}" stroke="${s}" stroke-width="0.8" stroke-linejoin="round"/>` +  // main wings
        `<polygon points="20,30 27,34 20,32 13,34" fill="${color}" stroke="${s}" stroke-width="0.8" stroke-linejoin="round"/>`   // tail wings
      );
    case 'Boats': {
      const sub = resolveBoatSubtype(vehicleClass ?? '');
      switch (sub) {
        case 'ship':
          // Large warship / destroyer: long hull with superstructure
          return wrap(
            `<path d="M20,2 L30,10 L30,32 Q30,38 20,38 Q10,38 10,32 L10,10 Z" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<rect x="15" y="12" width="10" height="8" rx="1" fill="${color}" stroke="${s}" stroke-width="0.8"/>` +  // bridge
            `<line x1="20" y1="12" x2="20" y2="6" stroke="${s}" stroke-width="1.5"/>` +  // mast
            `<line x1="17" y1="8" x2="23" y2="8" stroke="${s}" stroke-width="0.8"/>`     // yardarm
          );
        case 'armed':
          // Armed speedboat: pointed bow, gun mount
          return wrap(
            `<path d="M20,3 L30,14 L30,32 Q30,37 20,37 Q10,37 10,32 L10,14 Z" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<circle cx="20" cy="12" r="3" fill="${color}" stroke="${s}" stroke-width="0.8"/>` +  // gun turret
            `<line x1="20" y1="9" x2="20" y2="4" stroke="${s}" stroke-width="2"/>`               // gun barrel
          );
        case 'civilian':
          // Civilian boat: simple hull, no weapons
          return wrap(
            `<path d="M20,5 L28,14 L28,32 Q28,36 20,36 Q12,36 12,32 L12,14 Z" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<line x1="20" y1="10" x2="20" y2="22" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>`
          );
        default:
          // Transport / assault boat
          return wrap(
            `<path d="M20,3 L30,14 L30,32 Q30,37 20,37 Q10,37 10,32 L10,14 Z" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<line x1="20" y1="8" x2="20" y2="20" stroke="rgba(255,255,255,0.4)" stroke-width="1"/>`
          );
      }
    }
    case 'Artillery':
      // Self-propelled artillery: hull, long barrel
      return wrap(
        `<rect x="9" y="12" width="22" height="24" rx="2" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
        `<rect x="7" y="14" width="4" height="20" rx="1.5" fill="#333"/>` +
        `<rect x="29" y="14" width="4" height="20" rx="1.5" fill="#333"/>` +
        `<circle cx="20" cy="22" r="5" fill="${color}" stroke="${s}" stroke-width="1"/>` +
        `<line x1="20" y1="17" x2="20" y2="2" stroke="${s}" stroke-width="3"/>`
      );
    case 'AAs':
      // Anti-air: hull with twin barrels diverging
      return wrap(
        `<rect x="10" y="14" width="20" height="22" rx="2" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
        `<rect x="8" y="16" width="4" height="18" rx="1.5" fill="#333"/>` +
        `<rect x="28" y="16" width="4" height="18" rx="1.5" fill="#333"/>` +
        `<circle cx="20" cy="22" r="5" fill="${color}" stroke="${s}" stroke-width="1"/>` +
        `<line x1="17" y1="17" x2="14" y2="3" stroke="${s}" stroke-width="2.2"/>` +
        `<line x1="23" y1="17" x2="26" y2="3" stroke="${s}" stroke-width="2.2"/>`
      );
    case 'Drones': {
      const sub = resolveDroneSubtype(vehicleClass ?? '');
      switch (sub) {
        case 'sentinel':
          // Flying-wing UCAV (like RQ-170 / X-47B): swept delta flying wing, no tail
          return wrap(
            `<polygon points="20,4 38,30 32,28 20,34 8,28 2,30" fill="${color}" stroke="${s}" stroke-width="${sw}" stroke-linejoin="round"/>` +
            `<line x1="20" y1="12" x2="20" y2="26" stroke="${s}" stroke-width="1.2"/>` +
            `<circle cx="20" cy="18" r="2.5" fill="none" stroke="${s}" stroke-width="0.8"/>`
          );
        case 'fixedwing':
          // Conventional fixed-wing drone (Greyhawk/Reaper/YABHON): fuselage, straight wings, V-tail
          return wrap(
            `<ellipse cx="20" cy="18" rx="2.8" ry="12" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<line x1="4" y1="20" x2="36" y2="20" stroke="${color}" stroke-width="3"/>` +
            `<line x1="4" y1="20" x2="36" y2="20" stroke="${s}" stroke-width="0.8"/>` +
            `<line x1="20" y1="30" x2="14" y2="36" stroke="${color}" stroke-width="2.5"/>` +
            `<line x1="20" y1="30" x2="26" y2="36" stroke="${color}" stroke-width="2.5"/>` +
            `<line x1="20" y1="30" x2="14" y2="36" stroke="${s}" stroke-width="0.7"/>` +
            `<line x1="20" y1="30" x2="26" y2="36" stroke="${s}" stroke-width="0.7"/>`
          );
        case 'ugv_tracked':
          // Tracked UGV (Stomper): small tracked vehicle with sensor mast
          return wrap(
            `<rect x="10" y="8" width="20" height="24" rx="3" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<rect x="7" y="10" width="4" height="20" rx="1.5" fill="#333" stroke="${s}" stroke-width="0.5"/>` +
            `<rect x="29" y="10" width="4" height="20" rx="1.5" fill="#333" stroke="${s}" stroke-width="0.5"/>` +
            `<circle cx="20" cy="16" r="3" fill="none" stroke="${s}" stroke-width="1.2"/>` +
            `<line x1="20" y1="13" x2="20" y2="8" stroke="${s}" stroke-width="1.5"/>`
          );
        case 'ugv_wheeled':
          // Small wheeled UGV (ED-1D / Pelican): compact body, 4 wheels
          return wrap(
            `<rect x="13" y="10" width="14" height="20" rx="4" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<circle cx="12" cy="14" r="3" fill="#333" stroke="${s}" stroke-width="0.5"/>` +
            `<circle cx="28" cy="14" r="3" fill="#333" stroke="${s}" stroke-width="0.5"/>` +
            `<circle cx="12" cy="26" r="3" fill="#333" stroke="${s}" stroke-width="0.5"/>` +
            `<circle cx="28" cy="26" r="3" fill="#333" stroke="${s}" stroke-width="0.5"/>` +
            `<circle cx="20" cy="17" r="2" fill="none" stroke="${s}" stroke-width="0.8"/>`
          );
        default:
          // Quadcopter (Darter / Falcon / unknown): X-frame body, 4 rotors
          return wrap(
            `<line x1="12" y1="12" x2="28" y2="28" stroke="${s}" stroke-width="2"/>` +
            `<line x1="28" y1="12" x2="12" y2="28" stroke="${s}" stroke-width="2"/>` +
            `<circle cx="20" cy="20" r="4" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<circle cx="12" cy="12" r="4" fill="none" stroke="${s}" stroke-width="0.8"/>` +
            `<circle cx="28" cy="12" r="4" fill="none" stroke="${s}" stroke-width="0.8"/>` +
            `<circle cx="12" cy="28" r="4" fill="none" stroke="${s}" stroke-width="0.8"/>` +
            `<circle cx="28" cy="28" r="4" fill="none" stroke="${s}" stroke-width="0.8"/>`
          );
      }
    }
    case 'Turrets': {
      const sub = resolveTurretSubtype(vehicleClass ?? '');
      switch (sub) {
        case 'sam':
          // SAM launcher: base platform with angled missile tubes
          return wrap(
            `<rect x="12" y="18" width="16" height="14" rx="2" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<rect x="14" y="10" width="5" height="12" rx="1" fill="${color}" stroke="${s}" stroke-width="0.8"/>` + // left launcher
            `<rect x="21" y="10" width="5" height="12" rx="1" fill="${color}" stroke="${s}" stroke-width="0.8"/>` + // right launcher
            `<line x1="16" y1="10" x2="16" y2="4" stroke="${s}" stroke-width="1.5"/>` +  // left missile
            `<line x1="24" y1="10" x2="24" y2="4" stroke="${s}" stroke-width="1.5"/>` +  // right missile
            `<polygon points="16,4 14,6 18,6" fill="${s}"/>` +                            // left warhead
            `<polygon points="24,4 22,6 26,6" fill="${s}"/>`                              // right warhead
          );
        case 'aaa':
          // Anti-air autocannon: rotating platform with rapid-fire barrels
          return wrap(
            `<rect x="12" y="18" width="16" height="14" rx="2" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<circle cx="20" cy="22" r="5" fill="${color}" stroke="${s}" stroke-width="1"/>` +
            `<line x1="16" y1="18" x2="13" y2="4" stroke="${s}" stroke-width="1.8"/>` +
            `<line x1="20" y1="18" x2="20" y2="3" stroke="${s}" stroke-width="1.8"/>` +
            `<line x1="24" y1="18" x2="27" y2="4" stroke="${s}" stroke-width="1.8"/>`
          );
        case 'radar':
          // Radar station: base with dish antenna
          return wrap(
            `<rect x="14" y="24" width="12" height="10" rx="2" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<line x1="20" y1="24" x2="20" y2="14" stroke="${s}" stroke-width="2"/>` +   // mast
            `<path d="M10,16 Q20,6 30,16" fill="none" stroke="${s}" stroke-width="2.5"/>` + // dish
            `<circle cx="20" cy="16" r="2" fill="${s}"/>`                                  // feed horn
          );
        case 'naval':
          // Ship-mounted weapon (Mk45 / VLS): deck mount with large barrel or launcher
          return wrap(
            `<rect x="10" y="18" width="20" height="16" rx="2" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<rect x="14" y="12" width="12" height="10" rx="2" fill="${color}" stroke="${s}" stroke-width="0.8"/>` +
            `<line x1="20" y1="12" x2="20" y2="3" stroke="${s}" stroke-width="3.5"/>`
          );
        case 'mortar':
          // Mortar: baseplate with tube
          return wrap(
            `<ellipse cx="20" cy="28" rx="10" ry="5" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<line x1="20" y1="28" x2="20" y2="8" stroke="${s}" stroke-width="3"/>` +
            `<circle cx="20" cy="8" r="2" fill="${s}"/>`
          );
        default:
          // HMG / GMG static weapon: tripod base + barrel
          return wrap(
            `<rect x="12" y="16" width="16" height="16" rx="2" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
            `<circle cx="20" cy="24" r="5" fill="${color}" stroke="${s}" stroke-width="1.2"/>` +
            `<line x1="20" y1="19" x2="20" y2="6" stroke="${s}" stroke-width="3"/>`
          );
      }
    }
    case 'Submersibles':
      // Submarine: elongated hull, conning tower
      return wrap(
        `<ellipse cx="20" cy="20" rx="7" ry="16" fill="${color}" stroke="${s}" stroke-width="${sw}"/>` +
        `<rect x="16" y="16" width="8" height="6" rx="1.5" fill="${color}" stroke="${s}" stroke-width="0.8"/>` +
        `<line x1="20" y1="16" x2="20" y2="12" stroke="${s}" stroke-width="1.2"/>`
      );
    case 'Mines':
      // Red caution triangle — ⚠ warning icon (not rotated by dir)
      return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 40 40" style="display:block;">` +
        `<polygon points="20,4 37,34 3,34" fill="#cc2222" stroke="#880000" stroke-width="2" stroke-linejoin="round"/>` +
        `<text x="20" y="29" text-anchor="middle" fill="#fff" font-weight="bold" font-size="20" font-family="Arial,sans-serif">!</text>` +
        `</svg>`;
    default:
      return wrap(`<rect x="10" y="10" width="20" height="20" rx="3" fill="${color}" stroke="${s}" stroke-width="${sw}"/>`);
  }
}

function mineLabel(vehicleClass: string): string {
  const t = vehicleClass.toLowerCase();
  if (t.includes('apers') && t.includes('trip'))     return 'Trip Mine';
  if (t.includes('apers') && t.includes('bound'))    return 'Bounding Mine';
  if (t.includes('apers'))                           return 'APERS Mine';
  if (t.includes('atmine') || (t.includes('at') && t.includes('mine'))) return 'AT Mine';
  if (t.includes('claymore'))                        return 'Claymore';
  if (t.includes('slam'))                            return 'SLAM';
  if (t.includes('satchel'))                         return 'Satchel';
  if (t.includes('demo'))                            return 'Demo Charge';
  if (t.includes('ied'))                             return 'IED';
  return 'Mine';
}

function vehicleIcon(vehicle: Vehicle, units: Record<string, Unit>, category: string): L.DivIcon {
  // Mine: red caution triangle with type label, no side color
  if (category === 'Mines') {
    const size = 40;
    const label = escapeHtml(mineLabel(vehicle.class));
    const svg = `<div class="map-marker-wrap"><div style="display:flex;flex-direction:column;align-items:center;">` +
      vehicleSvg('Mines', '', 0).replace('width="20" height="20"', `width="${size}" height="${size}"`) +
      `<div class="map-marker-label" style="color:#cc2222;font-weight:700;white-space:nowrap;">${label}</div>` +
      `</div></div>`;
    return L.divIcon({ className: '', iconSize: [size, size + 14], iconAnchor: [size / 2, size / 2], html: svg });
  }
  const firstCrew = vehicle.crew[0];
  let side = firstCrew ? (units[firstCrew.unitId]?.side ?? '') : '';
  if (!side) {
    const occupants = Object.values(units).filter(u => u.vehicleId === vehicle.id);
    const preferred = occupants.find(u => u.playerName?.trim()) ?? occupants[0];
    side = preferred?.side ?? 'unknown';
  }
  const color = sideColor(side);
  const size = 80;
  return L.divIcon({
    className:  '',
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    html: vehicleIconHtml(category, color, vehicle.dir, size, vehicle.class),
  });
}

// â”€â”€ Layer manager â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Static contour styling (from pre-computed Athena Desktop cache)
// sea level -> blue; index (div 100m) -> darker/thicker brown; major (div 20m) -> medium brown
function contourStyle(z: number): { color: string; weight: number; opacity: number } {
  if (z === 0)        return { color: '#8492a8', weight: 0.7, opacity: 0.7 };
  if (z % 100 === 0)  return { color: '#7f8ea5', weight: 0.8, opacity: 0.76 };
  return                     { color: '#a9b5c5', weight: 0.5, opacity: 0.58 };
}

// Smooth stair-stepped contour rings from grid-derived data (e.g. coastline Z=0)
// using 2 iterations of Chaikin corner-cutting. This preserves overall shape while
// removing blocky orthogonal corners.
function smoothRing(points: [number, number][], iterations = 2): [number, number][] {
  if (points.length < 4) return points;
  let ring = points;
  for (let it = 0; it < iterations; it++) {
    const out: [number, number][] = [];
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const p0 = ring[i];
      const p1 = ring[(i + 1) % n];
      // Q and R points for Chaikin subdivision
      out.push([
        0.75 * p0[0] + 0.25 * p1[0],
        0.75 * p0[1] + 0.25 * p1[1],
      ]);
      out.push([
        0.25 * p0[0] + 0.75 * p1[0],
        0.25 * p0[1] + 0.75 * p1[1],
      ]);
    }
    ring = out;
  }
  return ring;
}

import type { LayerVisibility, RenderMode } from '../App';

// Elevation colour ramp helpers — Bus Athena Desktop palette.
// HeatMap 1 (ground forces): green #0A7002 → red smooth transition
function topoColorHeatmap1(t: number): [number, number, number] {
  // Simple 2-stop ramp: green at low elevation → red at high elevation
  const r = Math.round(10 + t * (200 - 10));    // 10 → 200
  const g = Math.round(112 - t * (112 - 10));   // 112 → 10
  const b = Math.round(2 + t * (5 - 2));        // 2 → 5
  return [r, g, b];
}

interface LayerManagerProps {
  units:      Record<string, Unit>;
  vehicles:   Record<string, Vehicle>;
  groups:     Record<string, Group>;
  world:      string;
  worldSize:  number;
  roads:      Road[];
  forests:    ForestsData | null;
  locations:  MapLocation[];
  structures: MapStructure[];
  elevations: ElevationsData | null;
  contours:   ContourLine[];
  layers:     LayerVisibility;
  onLayersChange?: Dispatch<SetStateAction<LayerVisibility>>;
  renderMode: RenderMode;
  vehicleMap:  Map<string, string>;
  locationMap: Map<string, { DrawStyle: string; SizeText: number; Name: string }>;
}

function LayerManager({ units, vehicles, groups, world, worldSize, roads, forests, locations, structures, elevations, contours, layers, onLayersChange, renderMode, vehicleMap, locationMap }: LayerManagerProps) {
  const map = useMap();

  // Canvas renderer for roads — lazy-initialised in the init effect after the athena-road pane exists.
  const canvasRef = useRef<L.Canvas | null>(null);

  // Static-layer caching: these layers render once per world and are never rebuilt.
  // When the world name changes all flags reset so they re-render for the new map.
  const staticCacheRef = useRef({ world: '', roads: false, locations: false, structures: false, objects: false, forests: false });
  if (world && world !== staticCacheRef.current.world) {
    staticCacheRef.current = { world, roads: false, locations: false, structures: false, objects: false, forests: false };
  }

  // Layer groups (created once, never recreated)
  const forestLayerRef     = useRef<L.LayerGroup>(L.layerGroup());
  const roadLayerRef       = useRef<L.LayerGroup>(L.layerGroup());
  const locationLayerRef   = useRef<L.LayerGroup>(L.layerGroup());
  const peakLayerRef       = useRef<L.LayerGroup>(L.layerGroup());
  const structureLayerRef  = useRef<L.LayerGroup>(L.layerGroup());
  const topoLayerRef       = useRef<L.LayerGroup>(L.layerGroup());
  const groupLayerRef      = useRef<L.LayerGroup>(L.layerGroup());
  const waypointLayerRef    = useRef<L.LayerGroup>(L.layerGroup());
  const vehicleLayerRef    = useRef<L.LayerGroup>(L.layerGroup());
  const contourLayerRef    = useRef<L.LayerGroup>(L.layerGroup());
  const coastLayerRef      = useRef<L.LayerGroup>(L.layerGroup());
  const unitLayerRef       = useRef<L.LayerGroup>(L.layerGroup());
  const treeLayerRef       = useRef<L.LayerGroup>(L.layerGroup());
  const objectLayerRef     = useRef<L.LayerGroup>(L.layerGroup());
  const landLayerRef       = useRef<L.LayerGroup>(L.layerGroup());

  // Track map zoom level so vehicle crew labels can appear/disappear reactively
  const [mapZoom, setMapZoom] = useState(() => map.getZoom());
  useEffect(() => {
    const onZoom = () => setMapZoom(map.getZoom());
    map.on('zoomend', onZoom);
    return () => { map.off('zoomend', onZoom); };
  }, [map]);

  // Create custom panes with fixed z-indices so layer order is always maintained
  // regardless of toggle sequence (addTo re-inserts at DOM end, breaking stacking).
  useEffect(() => {
    const mk = (name: string, z: number) => {
      const p = map.createPane(name);
      p.style.zIndex = String(z);
      p.style.pointerEvents = 'none';
    };
    mk('athena-land',       200);  // permanent land base (below topo)
    mk('athena-topo',       201);
    mk('athena-contour',    202);
    mk('athena-forest',     203);
    mk('athena-coast',      299);
    mk('athena-road',       300);
    mk('athena-structure',  310);
    mk('athena-peak',       360);
    mk('athena-objects',    205);  // buildings/objects — auto-shown at zoom ≥2x
    mk('athena-tree',       207);  // individual trees above objects
    mk('athena-location',   600);
    mk('athena-vehicle',    700);
    mk('athena-unit',       710);
    mk('athena-waypoint',   715);  // waypoint lines — always visible, between units and groups
    mk('athena-group',      720);  // groups on top of units/vehicles
    // Canvas renderer created here so it targets the athena-road pane
    canvasRef.current = L.canvas({ padding: 0.5, pane: 'athena-road' });
    // Ocean / sea background — visible wherever no elevation tile covers
    map.getContainer().style.background = '#B5E1E5';
    // Add all layer groups once — they stay on the map forever;
    // visibility is controlled by pane CSS (and addTo/removeLayer for locations)
    landLayerRef.current.addTo(map);
    contourLayerRef.current.addTo(map);
    topoLayerRef.current.addTo(map);
    forestLayerRef.current.addTo(map);
    roadLayerRef.current.addTo(map);
    structureLayerRef.current.addTo(map);
    coastLayerRef.current.addTo(map);
    locationLayerRef.current.addTo(map);
    peakLayerRef.current.addTo(map);
    treeLayerRef.current.addTo(map);
    objectLayerRef.current.addTo(map);
    groupLayerRef.current.addTo(map);
    waypointLayerRef.current.addTo(map);
    vehicleLayerRef.current.addTo(map);
    unitLayerRef.current.addTo(map);
  }, [map]);

  // Toggle layer visibility.
  // Image / vector layers: toggle the custom pane's CSS display (no DOM churn, z-order preserved).
  // Locations: addTo/removeLayer so that permanent tooltip elements are also removed from the DOM.
  useEffect(() => {
    const showPane = (name: string, on: boolean) => {
      const p = map.getPane(name);
      if (p) p.style.display = on ? '' : 'none';
    };
    // Keep land base visible in all modes so the map never collapses to all-blue.
    showPane('athena-land',      true);
    showPane('athena-topo',      renderMode !== '2d');  // topo elevation: only in heatmap modes
    showPane('athena-contour',   layers.contours);
    showPane('athena-forest',    true);
    // Coastline remains visible in all map styles regardless of contour toggle.
    showPane('athena-coast',     true);
    showPane('athena-road',      layers.roads);
    // Guarantee object visibility: keep raster objects visible; vector structures may overlay.
    showPane('athena-structure', structures.length > 0);
    showPane('athena-objects',   true);
    // In heatmap modes, reduce forest/tree/object opacity so the topo elevation layer is visible.
    const forestOpacity  = renderMode === '2d' ? '1' : renderMode === 'heatmap1' ? '0.25' : '0.15';
    const treeOpacity    = renderMode === '2d' ? '1' : '0.15';
    const objectOpacity  = renderMode === '2d' ? '1' : '0.4';
    const fp = map.getPane('athena-forest'); if (fp) fp.style.opacity = forestOpacity;
    const tp2 = map.getPane('athena-tree');  if (tp2) tp2.style.opacity = treeOpacity;
    const op2 = map.getPane('athena-objects'); if (op2) op2.style.opacity = objectOpacity;
    showPane('athena-peak',      layers.locations);
    showPane('athena-group',     layers.groups);
    showPane('athena-waypoint',  layers.waypoints);
    showPane('athena-vehicle',   layers.vehicles);
    showPane('athena-unit',      layers.units);
    // trees + objects are controlled by the zoom useEffect below
    // Locations use addTo/removeLayer so permanent tooltip DOM elements are also hidden
    if (layers.locations) {
      if (!map.hasLayer(locationLayerRef.current)) locationLayerRef.current.addTo(map);
    } else {
      if (map.hasLayer(locationLayerRef.current)) map.removeLayer(locationLayerRef.current);
    }
  }, [map, layers, renderMode, structures.length]);

  // ── Trees — backend-rendered PNG raster ──────────────────────────────────────────────────
  useEffect(() => {
    if (!world) return;
    let cancelled = false;
    const bounds: L.LatLngBoundsExpression = [[0, 0], [100, 100]];

    treeLayerRef.current.clearLayers();
    fetch(`${API_BASE}/api/staticmap/${encodeURIComponent(world)}/trees-image?v=20260312c`)
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (!blob || cancelled) return;
        const objUrl = URL.createObjectURL(blob);
        const ov = L.imageOverlay(objUrl, bounds, { pane: 'athena-tree', opacity: 1, interactive: false })
          .addTo(treeLayerRef.current);
        const el = ov.getElement();
        if (el) { el.style.imageRendering = 'pixelated'; el.style.willChange = 'transform'; }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [world]);

  // ── Objects — vector tile rendering (sharp at every zoom, like roads) ──────────────────
  useEffect(() => {
    if (staticCacheRef.current.objects) return; // already rendered for this world
    objectLayerRef.current.clearLayers();
    if (!world || !worldSize) return;
    let cancelled = false;
    const scale = 100 / worldSize;
    const GRID = 64;
    const cellW = worldSize / GRID;

    const linearRe  = /fence|wall|wire|barrier|pipe|pole|rail|net[_-]|columnwire|powerline/;
    const buildingRe = /house|shed|garage|church|shop|hangar|hospital|terminal|office|barracks|tower|warehouse/;

    fetch(`${API_BASE}/api/staticmap/${encodeURIComponent(world)}/objects-data`)
      .then(r => r.ok ? r.json() : null)
      .then((data: any[] | null) => {
        if (!data || !data.length || cancelled) return;

        // Spatial index: classify & bucket objects into grid cells
        type ObjType = 0 | 1 | 2; // 0=fence/wall 1=building 2=other
        interface ObjRec { lat: number; lng: number; w: number; h: number; dir: number; tp: ObjType }

        const cells = new Map<number, ObjRec[]>();
        for (const raw of data) {
          const cx  = typeof raw.CanvasX === 'number' ? raw.CanvasX : parseFloat(raw.CanvasX) || 0;
          const cy  = typeof raw.CanvasY === 'number' ? raw.CanvasY : parseFloat(raw.CanvasY) || 0;
          const w   = (typeof raw.Width  === 'string' ? parseFloat(raw.Width)  : raw.Width)  || 2;
          const h   = (typeof raw.Length === 'string' ? parseFloat(raw.Length) : raw.Length) || 2;
          const dir = (typeof raw.Dir   === 'string' ? parseFloat(raw.Dir)   : raw.Dir)   || 0;
          const mdl = ((raw.Model as string) || '').toLowerCase().trim();

          const minD = Math.min(w, h), maxD = Math.max(w, h);
          const aspect = maxD / Math.max(minD, 0.01);
          const area = w * h;
          const isLin = (aspect >= 4 && minD < 1.2) || linearRe.test(mdl);
          const isBld = !isLin && (buildingRe.test(mdl) || area >= 55);
          const tp: ObjType = isLin ? 0 : isBld ? 1 : 2;

          const lat = (worldSize - cy) * scale;
          const lng = cx * scale;
          const gx = Math.min(GRID - 1, Math.max(0, Math.floor(cx / cellW)));
          const gy = Math.min(GRID - 1, Math.max(0, Math.floor(cy / cellW)));
          let arr = cells.get(gy * GRID + gx);
          if (!arr) { arr = []; cells.set(gy * GRID + gx, arr); }
          arr.push({ lat, lng, w, h, dir, tp });
        }

        // Custom GridLayer — renders objects per tile at native pixel resolution.
        const ObjGrid = (L.GridLayer as any).extend({
          createTile(this: any, coords: any) {
            const tile = document.createElement('canvas');
            const sz = this.getTileSize();
            tile.width = sz.x; tile.height = sz.y;
            const ctx = tile.getContext('2d')!;
            const m = this._map as L.Map;
            if (!m) return tile;

            // Tile NW pixel origin
            const nw = new L.Point(coords.x * sz.x, coords.y * sz.y);
            const nwLL = m.unproject(nw, coords.z);
            const seLL = m.unproject(new L.Point(nw.x + sz.x, nw.y + sz.y), coords.z);

            const minLng = Math.min(nwLL.lng, seLL.lng);
            const maxLng = Math.max(nwLL.lng, seLL.lng);
            const minLat = Math.min(nwLL.lat, seLL.lat);
            const maxLat = Math.max(nwLL.lat, seLL.lat);

            // Convert to world coords for spatial index
            const wMinX = minLng / scale;
            const wMaxX = maxLng / scale;
            const cMinY = worldSize - maxLat / scale; // higher lat = lower canvasY
            const cMaxY = worldSize - minLat / scale;

            const gxMin = Math.max(0, Math.floor(wMinX / cellW));
            const gxMax = Math.min(GRID - 1, Math.floor(wMaxX / cellW));
            const gyMin = Math.max(0, Math.floor(cMinY / cellW));
            const gyMax = Math.min(GRID - 1, Math.floor(cMaxY / cellW));

            // Pixels-per-metre at this zoom level (for object sizing)
            const ppm = scale * Math.pow(2, coords.z);

            // At very low ppm, linear objects are sub-pixel — skip to save work
            const showLinear = ppm >= 0.25;

            for (let gy2 = gyMin; gy2 <= gyMax; gy2++) {
              for (let gx2 = gxMin; gx2 <= gxMax; gx2++) {
                const bucket = cells.get(gy2 * GRID + gx2);
                if (!bucket) continue;
                for (const o of bucket) {
                  if (o.tp === 0 && !showLinear) continue;
                  // Cull objects outside tile with small margin
                  if (o.lng < minLng - 0.5 || o.lng > maxLng + 0.5 ||
                      o.lat < minLat - 0.5 || o.lat > maxLat + 0.5) continue;

                  const pt = m.project([o.lat, o.lng], coords.z);
                  const px = pt.x - nw.x;
                  const py = pt.y - nw.y;
                  const pw = o.w * ppm;
                  const ph = o.h * ppm;

                  ctx.save();
                  ctx.translate(px, py);
                  if (o.dir) ctx.rotate(o.dir * Math.PI / 180);

                  if (o.tp === 0) {
                    // Fence/wall/wire — crisp line along major axis
                    const halfLong = Math.max(0.5, Math.max(pw, ph) / 2);
                    const isWide = o.w >= o.h;
                    ctx.lineCap = 'round';
                    // Halo
                    ctx.strokeStyle = 'rgba(160,172,186,0.50)';
                    ctx.lineWidth = 1.8;
                    ctx.beginPath();
                    if (isWide) { ctx.moveTo(-halfLong, 0); ctx.lineTo(halfLong, 0); }
                    else        { ctx.moveTo(0, -halfLong); ctx.lineTo(0, halfLong); }
                    ctx.stroke();
                    // Core
                    ctx.strokeStyle = 'rgba(68,80,96,0.92)';
                    ctx.lineWidth = 0.9;
                    ctx.beginPath();
                    if (isWide) { ctx.moveTo(-halfLong, 0); ctx.lineTo(halfLong, 0); }
                    else        { ctx.moveTo(0, -halfLong); ctx.lineTo(0, halfLong); }
                    ctx.stroke();
                  } else if (o.tp === 1) {
                    // Building — dark filled footprint with outline
                    const bw = Math.max(1.5, pw);
                    const bh = Math.max(1.5, ph);
                    ctx.fillStyle = 'rgba(100,112,126,0.72)';
                    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
                    ctx.strokeStyle = 'rgba(68,80,96,0.90)';
                    ctx.lineWidth = 0.7;
                    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
                  } else {
                    // Other — outline only
                    const ow = Math.max(1, pw);
                    const oh = Math.max(1, ph);
                    ctx.strokeStyle = 'rgba(78,90,106,0.65)';
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(-ow / 2, -oh / 2, ow, oh);
                  }
                  ctx.restore();
                }
              }
            }
            return tile;
          },
        });

        if (cancelled) return;
        const objGrid = new ObjGrid({
          pane: 'athena-objects',
          tileSize: 256,
          updateWhenZooming: false,
          updateWhenIdle: true,
        });
        objectLayerRef.current.addLayer(objGrid);
        staticCacheRef.current.objects = true;
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [world, worldSize]);

  // ── Zoom auto-show for tree pane + unit/vehicle ↔ group auto-toggle ──────────────────
  useEffect(() => {
    // Trees only visible at display scale ≥ 2.0x.
    // scale = 0.1 + ((zoom - 3) / 7.5) * 2.9 → zoom ≈ 7.9 = 2.0x
    const TREE_THRESHOLD = 7.9;
    const UNIT_GROUP_THRESHOLD = 7.9;  // ≈ 2.0x display scale
    // Initialise to opposite of current zone so the first update() establishes correct state
    const prevZoneRef = { current: !(map.getZoom() >= UNIT_GROUP_THRESHOLD) };
    const update = () => {
      const z = map.getZoom();
      const tp = map.getPane('athena-tree');
      if (tp) tp.style.display = z >= TREE_THRESHOLD ? '' : 'none';
      const op = map.getPane('athena-objects');
      if (op) op.style.display = '';
      // At scale < 2.0x (zoomed out): show groups, hide units + vehicles
      // At scale ≥ 2.0x (zoomed in):  show units + vehicles, hide groups
      // Auto-toggle fires only when crossing the threshold;
      // user can still override manually within a zoom zone.
      const inUnitZone = z >= UNIT_GROUP_THRESHOLD;
      if (inUnitZone !== prevZoneRef.current) {
        prevZoneRef.current = inUnitZone;
        onLayersChange?.(prev => ({
          ...prev,
          groups:   !inUnitZone,
          vehicles:  inUnitZone,
          units:     inUnitZone,
        }));
      }
    };
    map.on('zoomend', update);
    update(); // apply immediately on mount
    return () => { map.off('zoomend', update); };
  }, [map, onLayersChange]);

  // ── Land silhouette — permanent base showing land (#FEFFEF) vs ocean (transparent) ───────
  // Tries vector fill from static Z=0 contour first (smooth/exact coastline),
  // then falls back to static raster land mask, then Arma elevation data.
  useEffect(() => {
    landLayerRef.current.clearLayers();
    let cancelled = false;

    async function buildLandLayer() {
      // ── Path 0: static Z=0 contour polygon fill (smooth, exact coastline) ─
      const z0 = contours.find(c => c.z === 0);
      if (z0 && z0.lines.length > 0) {
        const scale = 100 / worldSize;
        const rings: L.LatLngExpression[][] = z0.lines
          .map(flat => {
            const pts: L.LatLngExpression[] = [];
            for (let i = 0; i + 1 < flat.length; i += 2) {
              // [lat=Y, lng=X] in normalised 0..100 map space
              pts.push([flat[i + 1] * scale, flat[i] * scale]);
            }
            return pts;
          })
          .filter(r => r.length >= 3);

        if (rings.length > 0) {
          L.polygon(rings, {
            pane:        'athena-land',
            stroke:      false,
            fillColor:   '#FEFFEF',
            fillOpacity: 1,
            fillRule:    'evenodd',
            smoothFactor: 1,
            interactive: false,
          }).addTo(landLayerRef.current);
          return; // primary land base rendered; avoid stacking a second world layer
        }
      }

      // ── Path 1: static Bus cache land mask (fast, pre-computed) ──────────
      if (world) {
        try {
          const resp = await fetch(
            `${API_BASE}/api/staticmap/${encodeURIComponent(world)}/landmask?gridSize=1024`);
          if (!cancelled && resp.ok) {
            const data: { width: number; height: number; worldSize: number; mask: string } =
              await resp.json();
            const bytes = Uint8Array.from(atob(data.mask), c => c.charCodeAt(0));
            const cvs   = document.createElement('canvas');
            cvs.width = data.width; cvs.height = data.height;
            const ctx = cvs.getContext('2d')!;
            const img = ctx.createImageData(data.width, data.height);
            for (let i = 0; i < bytes.length; i++) {
              if (bytes[i]) {
                const o = i * 4;
                img.data[o] = 254; img.data[o+1] = 255; img.data[o+2] = 239; img.data[o+3] = 255;
              }
            }
            ctx.putImageData(img, 0, 0);
            const ov = L.imageOverlay(cvs.toDataURL('image/png'), [[0, 0], [100, 100]], {
              opacity: 1, interactive: false, pane: 'athena-land',
            }).addTo(landLayerRef.current);
            const el = ov.getElement();
            if (el) { el.style.imageRendering = 'auto'; el.style.willChange = 'transform'; }
            return; // done — no need for Arma elevation fallback
          }
        } catch { /* fall through to Arma elevation */ }
      }
      if (cancelled) return;

      // ── Path 2: Arma elevation data (arrives after slow in-game export) ──
      if (!elevations || elevations.cells.length === 0) return;
      const step = elevations.sampleSize;
      if (!Number.isFinite(step) || step <= 0) return;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      elevations.cells.forEach(c => {
        if (c.x        < minX) minX = c.x;
        if (c.y        < minY) minY = c.y;
        if (c.x + step > maxX) maxX = c.x + step;
        if (c.y + step > maxY) maxY = c.y + step;
      });
      if (!isFinite(minX) || !isFinite(maxX) || !isFinite(maxY)) return;
      const cols = Math.round((maxX - minX) / step);
      const rows = Math.round((maxY - minY) / step);
      if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) return;
      const cvs  = document.createElement('canvas');
      cvs.width = cols; cvs.height = rows;
      const ctx  = cvs.getContext('2d')!;
      const img  = ctx.createImageData(cols, rows);
      elevations.cells.forEach(c => {
        const col = Math.round((c.x - minX) / step);
        const row = rows - 1 - Math.round((c.y - minY) / step);
        if (col < 0 || col >= cols || row < 0 || row >= rows) return;
        if (c.z > 0) {
          const idx = (row * cols + col) * 4;
          img.data[idx] = 254; img.data[idx+1] = 255; img.data[idx+2] = 239; img.data[idx+3] = 255;
        }
      });
      ctx.putImageData(img, 0, 0);
      const scale = 100 / worldSize;
      const bounds: L.LatLngBoundsExpression = [
        [minY * scale, minX * scale],
        [maxY * scale, maxX * scale],
      ];
      const ov = L.imageOverlay(cvs.toDataURL('image/png'), bounds, {
        opacity: 1, interactive: false, pane: 'athena-land',
      }).addTo(landLayerRef.current);
      const el = ov.getElement();
      if (el) { el.style.imageRendering = 'pixelated'; el.style.willChange = 'transform'; }
    }

    buildLandLayer();
    return () => { cancelled = true; };
  }, [contours, world, elevations, worldSize]);

  // ── Elevation layers (topo colour ramp + greyscale + contour lines) ─────────────────────
  useEffect(() => {
    topoLayerRef.current.clearLayers();
    if (!elevations || elevations.cells.length === 0) return;

    const step = elevations.sampleSize;
    if (!Number.isFinite(step) || step <= 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    elevations.cells.forEach(c => {
      if (c.x        < minX) minX = c.x;
      if (c.y        < minY) minY = c.y;
      if (c.x + step > maxX) maxX = c.x + step;
      if (c.y + step > maxY) maxY = c.y + step;
      if (c.z < minZ) minZ = c.z;
      if (c.z > maxZ) maxZ = c.z;
    });
    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(maxY) || !isFinite(minZ) || !isFinite(maxZ) || maxZ === minZ) return;

    const cols   = Math.round((maxX - minX) / step);
    const rows   = Math.round((maxY - minY) / step);
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 1 || rows <= 1) return;
    const zRange = maxZ - minZ;

    // Render at 3× the grid resolution so contour lines are anti-aliased and smooth
    // when the image overlay is stretched to fill the Leaflet map bounds.
    const UP = 3;
    const W  = cols * UP;
    const H  = rows * UP;
    if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) return;

    // Per-cell height grid (at grid resolution, not upscaled) for marching squares.
    const heightGrid = new Float32Array(cols * rows).fill(NaN);

    const topoCvs = document.createElement('canvas');
    topoCvs.width = W; topoCvs.height = H;
    const topoCtx = topoCvs.getContext('2d')!;
    const topoImg = topoCtx.createImageData(W, H);



    elevations.cells.forEach(c => {
      const t   = Math.max(0, Math.min(1, (c.z - minZ) / zRange));
      const col = Math.round((c.x - minX) / step);
      const row = rows - 1 - Math.round((c.y - minY) / step);
      if (col < 0 || col >= cols || row < 0 || row >= rows) return;

      heightGrid[row * cols + col] = c.z;

      // Choose fill colour by render mode
      let fr: number, fg: number, fb: number, fa: number;
      if (renderMode === '2d') {
        fr = fg = fb = fa = 0;  // fully transparent — land base layer provides the colour
      } else if (renderMode === 'heatmap2') {
        const v = Math.round(255 - t * 255); fr = fg = fb = v; fa = 200;  // white → black
      } else {
        [fr, fg, fb] = topoColorHeatmap1(t); fa = 200;       // heatmap1 (default)
      }
      // Fill UP×UP block per cell in the upscaled image data
      for (let dy = 0; dy < UP; dy++) {
        for (let dx = 0; dx < UP; dx++) {
          const idx = ((row * UP + dy) * W + (col * UP + dx)) * 4;
          topoImg.data[idx] = fr; topoImg.data[idx+1] = fg;
          topoImg.data[idx+2] = fb; topoImg.data[idx+3] = fa;
        }
      }
    });

    // Commit colour-fill pixels first so contour strokes render on top.
    topoCtx.putImageData(topoImg, 0, 0);
    // Scale context so all existing moveTo/lineTo coordinates (in grid pixels)
    // automatically map to the upscaled canvas — no changes needed below.
    topoCtx.scale(UP, UP);

    // ── Marching squares contour lines ────────────────────────────────────────
    // Contour style cadence matches original Athena Desktop:
    //   every 10 m → thin brown (faint texture)
    //   every 30 m → medium stroke
    //   every 60 m → bolder
    //   every 120 m → boldest, always visible
    //   sea level (z=0) → blue
    const minZ10 = Math.ceil (minZ / 10) * 10;
    const maxZ10 = Math.floor(maxZ / 10) * 10;

    for (let z = minZ10; z <= maxZ10; z += 10) {
      const is120 = z % 120 === 0;
      const is60  = z % 60  === 0;
      const is30  = z % 30  === 0;

      // Opacity and line width by cadence
      const alpha = is120 ? 0.85 : is60 ? 0.65 : is30 ? 0.45 : 0.18;
      const lw    = is120 ? 1.5  : is60 ? 1.1  : is30 ? 0.7  : 0.35;

      if (z === 0) {
        topoCtx.strokeStyle = `rgba(30,30,200,${alpha})`;
      } else if (z < 0) {
        topoCtx.strokeStyle = `rgba(30,100,220,${alpha})`;
      } else {
        // RosyBrown family — original uses Colors.RosyBrown (#bc8f8f)
        topoCtx.strokeStyle = `rgba(120,75,55,${alpha})`;
      }
      topoCtx.lineWidth = lw;
      topoCtx.beginPath();

      // Standard 16-case marching squares lookup.
      // Bit ordering: tl=8, tr=4, br=2, bl=1.
      // Edge midpoints (in canvas px): top=(c+0.5,r), right=(c+1,r+0.5),
      //                                bottom=(c+0.5,r+1), left=(c,r+0.5).
      for (let r = 0; r < rows - 1; r++) {
        for (let c2 = 0; c2 < cols - 1; c2++) {
          const vTL = heightGrid[ r      * cols + c2    ];
          const vTR = heightGrid[ r      * cols + c2 + 1];
          const vBL = heightGrid[(r + 1) * cols + c2    ];
          const vBR = heightGrid[(r + 1) * cols + c2 + 1];
          if (isNaN(vTL) || isNaN(vTR) || isNaN(vBL) || isNaN(vBR)) continue;

          const ci = ((vTL >= z ? 8 : 0) | (vTR >= z ? 4 : 0)
                    | (vBR >= z ? 2 : 0) | (vBL >= z ? 1 : 0));

          // Each case draws 0-2 line segments between edge midpoints.
          // Using moveTo+lineTo batched inside a single beginPath for performance.
          switch (ci) {
            case  1: case 14:  // left → bottom
              topoCtx.moveTo(c2 + 0.5, r + 1);  topoCtx.lineTo(c2,       r + 0.5); break;
            case  2: case 13:  // bottom → right
              topoCtx.moveTo(c2 + 0.5, r + 1);  topoCtx.lineTo(c2 + 1,   r + 0.5); break;
            case  3: case 12:  // left → right
              topoCtx.moveTo(c2,       r + 0.5); topoCtx.lineTo(c2 + 1,   r + 0.5); break;
            case  4: case 11:  // top → right
              topoCtx.moveTo(c2 + 0.5, r);       topoCtx.lineTo(c2 + 1,   r + 0.5); break;
            case  5:           // saddle: (tl+br above, tr+bl below)
              topoCtx.moveTo(c2,       r + 0.5); topoCtx.lineTo(c2 + 0.5, r);
              topoCtx.moveTo(c2 + 0.5, r + 1);   topoCtx.lineTo(c2 + 1,   r + 0.5); break;
            case  6: case  9:  // top → bottom
              topoCtx.moveTo(c2 + 0.5, r);       topoCtx.lineTo(c2 + 0.5, r + 1);   break;
            case  7: case  8:  // top → left
              topoCtx.moveTo(c2 + 0.5, r);       topoCtx.lineTo(c2,       r + 0.5); break;
            case 10:           // saddle: (tl+br above, tr+bl below)
              topoCtx.moveTo(c2,       r + 0.5); topoCtx.lineTo(c2 + 0.5, r + 1);
              topoCtx.moveTo(c2 + 0.5, r);       topoCtx.lineTo(c2 + 1,   r + 0.5); break;
            // 0, 15: no crossings
          }
        }
      }
      topoCtx.stroke();
    }
    // ── End contour lines ─────────────────────────────────────────────────────

    const scale  = 100 / worldSize;
    const bounds: L.LatLngBoundsExpression = [
      [minY * scale, minX * scale],
      [maxY * scale, maxX * scale],
    ];
    const topoOv = L.imageOverlay(topoCvs.toDataURL('image/png'), bounds,
      { opacity: 0.75, interactive: false, pane: 'athena-topo' })
      .addTo(topoLayerRef.current);
    const topoEl = topoOv.getElement();
    if (topoEl) topoEl.style.willChange = 'transform';

    // ── Peak markers (local terrain maxima) ───────────────────────────────────
    // Detect cells that are the highest point within a sliding-window radius,
    // matching the summit triangles Arma renders on its in-game map.
    peakLayerRef.current.clearLayers();
    const RADIUS   = 16;  // cells (~512 m at 32 m step) — only dominant summits
    const MIN_ELEV = 50;  // ignore low hills and coastal bumps
    const MIN_PROM = 30;  // must be ≥30 m above all neighbors within radius
    const sc = 100 / worldSize;
    for (let r = RADIUS; r < rows - RADIUS; r++) {
      for (let c = RADIUS; c < cols - RADIUS; c++) {
        const z = heightGrid[r * cols + c];
        if (isNaN(z) || z < MIN_ELEV) continue;
        let isMax = true;
        let minN  = Infinity;
        outer: for (let dr = -RADIUS; dr <= RADIUS; dr++) {
          for (let dc = -RADIUS; dc <= RADIUS; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nz = heightGrid[(r + dr) * cols + (c + dc)];
            if (isNaN(nz)) continue;
            if (nz >= z) { isMax = false; break outer; }
            if (nz < minN) minN = nz;
          }
        }
        if (!isMax || z - minN < MIN_PROM) continue;
        const worldX = minX + c * step;
        const worldY = minY + (rows - 1 - r) * step;
        const ll: [number, number] = [worldY * sc, worldX * sc];
        const elev = Math.round(z);
        // White-filled triangle with dark stroke + small centre dot, Arma-style
        const peakSvg =
          `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="9" viewBox="0 0 10 9">` +
          `<polygon points="5,0.5 9.5,8.5 0.5,8.5" fill="white" stroke="#333" stroke-width="1"/>` +
          `<circle cx="5" cy="6.5" r="1" fill="#333"/>` +
          `</svg>`;
        L.marker(ll, {
          icon: L.divIcon({ className: '', html: peakSvg, iconSize: [10, 9], iconAnchor: [5, 9] }),
          interactive: false,
          pane: 'athena-peak',
        })
          .bindTooltip(
            `<span style="font-size:8px;color:#333;font-weight:600">${elev}</span>`,
            { permanent: true, direction: 'right', className: 'location-label', offset: [4, -5] }
          )
          .addTo(peakLayerRef.current);
      }
    }
  }, [elevations, worldSize, renderMode]);

  // -- Static Athena contour lines (pre-computed, loaded from Athena Desktop cache) --------
  useEffect(() => {
    contourLayerRef.current.clearLayers();
    coastLayerRef.current.clearLayers();
    if (contours.length === 0) return;
    const scale = 100 / worldSize;
    contours.forEach(cl => {
      const style = contourStyle(cl.z);
      // Each ContourLine.lines entry is a flat [x0,y0,x1,y1,...] array.
      // Build a multi-polyline (one Leaflet layer per elevation) for efficiency.
      const latlngs: [number, number][][] = cl.lines
        .map(flat => {
          const pts: [number, number][] = [];
          for (let i = 0; i + 1 < flat.length; i += 2)
            pts.push([flat[i + 1] * scale, flat[i] * scale]); // [lat=Y, lng=X]
          return pts;
        })
        .filter(p => p.length >= 2);
      if (latlngs.length === 0) return;

      // Sea-level coastline gets a dedicated pane in 2D mode so it stays visible
      // above forests and land fill, with a crisp outer + inner stroke.
      if (cl.z === 0) {
        const smoothLatLngs = latlngs.map(ring => smoothRing(ring));
        L.polyline(smoothLatLngs, {
          color:       '#d8e6f8',
          weight:      2.6,
          opacity:     0.85,
          lineJoin:    'round',
          lineCap:     'round',
          interactive: false,
          pane:        'athena-coast',
        }).addTo(coastLayerRef.current);
        L.polyline(smoothLatLngs, {
          color:       '#7789C0',
          weight:      1.0,
          opacity:     1,
          lineJoin:    'round',
          lineCap:     'round',
          interactive: false,
          pane:        'athena-coast',
        }).addTo(coastLayerRef.current);
      } else {
        L.polyline(latlngs, {
          color:       style.color,
          weight:      style.weight,
          opacity:     style.opacity,
          lineJoin:    'round',
          lineCap:     'round',
          interactive: false,
          pane:        'athena-contour',
        }).addTo(contourLayerRef.current);
      }
    });
  }, [contours, worldSize]);

  // â”€â”€ Forest layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (staticCacheRef.current.forests) return; // already rendered for this world
    forestLayerRef.current.clearLayers();
    if (!world) return;
    let cancelled = false;
    const bounds: L.LatLngBoundsExpression = [[0, 0], [100, 100]];

    // Prefer static trees-image (smooth density from Athena Desktop tree positions)
    // over the blocky Arma forest grid. Downscale the high-res tree image to produce
    // a natural-looking forest coverage layer visible at all zoom levels.
    fetch(`${API_BASE}/api/staticmap/${encodeURIComponent(world)}/trees-image`)
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (!blob || cancelled) return null;
        return new Promise<'done' | null>((resolve) => {
          const img = new Image();
          const objUrl = URL.createObjectURL(blob);
          img.onload = () => {
            URL.revokeObjectURL(objUrl);
            if (cancelled) { resolve('done'); return; }
            // Downscale to 1024px — individual dots merge into smooth density areas
            const DEST = 1024;
            const cvs = document.createElement('canvas');
            cvs.width = DEST; cvs.height = DEST;
            const ctx = cvs.getContext('2d')!;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, DEST, DEST);
            const ov = L.imageOverlay(cvs.toDataURL('image/png'), bounds, {
              opacity: 1, interactive: false, pane: 'athena-forest',
            }).addTo(forestLayerRef.current);
            const el = ov.getElement();
            if (el) { el.style.imageRendering = 'auto'; el.style.willChange = 'transform'; }
            staticCacheRef.current.forests = true;
            resolve('done');
          };
          img.onerror = () => { URL.revokeObjectURL(objUrl); resolve('done'); };
          img.src = objUrl;
        });
      })
      .then(result => {
        // If trees-image succeeded, we're done
        if (result === 'done' || cancelled || staticCacheRef.current.forests) return;
        // Fall back to Arma forest grid data
        if (!forests || forests.cells.length === 0) return;
        const step = forests.sampleSize;
        if (!Number.isFinite(step) || step <= 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        forests.cells.forEach(c => {
          if (c.level <= 0) return;
          if (c.x < minX) minX = c.x;  if (c.y < minY) minY = c.y;
          if (c.x + step > maxX) maxX = c.x + step;
          if (c.y + step > maxY) maxY = c.y + step;
        });
        if (!isFinite(minX)) return;
        const PX = 4;  // Reduce forest density: 6 → 4 makes cells smaller/sparser
        const cols = Math.round((maxX - minX) / step);
        const rows = Math.round((maxY - minY) / step);
        if (cols <= 0 || rows <= 0) return;
        const cvs = document.createElement('canvas');
        cvs.width = cols * PX; cvs.height = rows * PX;
        const ctx = cvs.getContext('2d')!;
        forests.cells.forEach(cell => {
          if (cell.level <= 0) return;
          const [r, g, b, a] = FOREST_RGBA[Math.min(cell.level, FOREST_RGBA.length - 1)];
          const col = Math.round((cell.x - minX) / step);
          const row = rows - 1 - Math.round((cell.y - minY) / step);
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx.fillRect(col * PX, row * PX, PX, PX);
        });
        const scale = 100 / worldSize;
        const fb: L.LatLngBoundsExpression = [[minY * scale, minX * scale], [maxY * scale, maxX * scale]];
        const ov = L.imageOverlay(cvs.toDataURL('image/png'), fb, {
          opacity: 1, interactive: false, pane: 'athena-forest',
        }).addTo(forestLayerRef.current);
        const el = ov.getElement();
        if (el) { el.style.imageRendering = 'pixelated'; el.style.willChange = 'transform'; }
        staticCacheRef.current.forests = true;
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [world, forests, worldSize, roads]);

  // â”€â”€ Road layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (staticCacheRef.current.roads) return; // already rendered for this world
    roadLayerRef.current.clearLayers();
    if (roads.length === 0) return;
    const scale = 100 / worldSize;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Group road segments by style for batched rendering (~6 layers vs thousands)
    const groups = new Map<string, { color: string; weight: number; segments: [number,number][][] }>();

    // Collect airport surfaces to render AFTER road passes (so runways draw on top)
    const airportRoads: Road[] = [];

    roads.forEach(road => {
      // Airport surfaces — collect for later
      if (road.type.toLowerCase() === 'hide' && road.width > 0 && road.length > 0) {
        airportRoads.push(road);
        return;
      }

      const style = roadStyle(road.type, road.foot);
      if (!style) return;

      const beg: [number, number] = [road.beg1Y * scale, road.beg1X * scale];
      const end: [number, number] = [road.end2Y * scale, road.end2X * scale];
      if (beg[0] === 0 && beg[1] === 0 && end[0] === 0 && end[1] === 0) return;

      const key = `${style.color}_${style.weight}`;
      let grp = groups.get(key);
      if (!grp) { grp = { color: style.color, weight: style.weight, segments: [] }; groups.set(key, grp); }
      grp.segments.push([beg, end]);
    });

    // Pass 1: all black borders (drawn first = behind)
    groups.forEach(({ weight, segments }) => {
      L.polyline(segments, {
        color:       '#222222',
        weight:      weight + 2,
        opacity:     0.7,
        lineCap:     'butt',
        interactive: false,
        renderer:    canvas,
      }).addTo(roadLayerRef.current);
    });

    // Pass 2: all coloured fills (drawn second = on top)
    groups.forEach(({ color, weight, segments }) => {
      L.polyline(segments, {
        color,
        weight,
        opacity:     0.85,
        lineCap:     'butt',
        interactive: false,
        renderer:    canvas,
      }).addTo(roadLayerRef.current);
    });

    // Pass 3: render each airport tile as its own rotated rectangle
    airportRoads.forEach(road => {
      const latlngs = rotatedRoadRect(road, scale);
      L.polygon(latlngs, {
        fillColor:   '#D3D3D3',
        fillOpacity: 1,
        stroke:      false,
        interactive: false,
        pane:        'athena-road',
        renderer:    canvas,
      }).addTo(roadLayerRef.current);
    });
    staticCacheRef.current.roads = true;
  }, [roads, worldSize]);

  // â”€â”€ Location labels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (staticCacheRef.current.locations) return; // already rendered for this world
    locationLayerRef.current.clearLayers();
    if (locations.length === 0) return;
    const scale = 100 / worldSize;
    locations.forEach(loc => {
      if (!loc.name) return;
      const locClass  = locationMap.get(loc.type);
      const drawStyle = locClass?.DrawStyle ?? 'name';
      const ll: [number, number] = [loc.posY * scale, loc.posX * scale];

      // Text label (DrawStyle === 'name')
      if (drawStyle !== 'name') return;
      // Keep labels fixed screen-size regardless map zoom level.
      const sizeText = locClass?.SizeText ?? 5;
      const fontSize = `${Math.round(10 + (sizeText - 4) * 3)}px`;
      const spacing  = sizeText >= 7 ? '1.8px' : sizeText >= 5 ? '1.2px' : '0.8px';
      L.marker(ll, {
        icon: L.divIcon({
          className: 'location-label',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          html: `<span style="font-size:${fontSize};letter-spacing:${spacing}">${escapeHtml(loc.name.toUpperCase())}</span>`,
        }),
        interactive: false,
        pane: 'athena-location',
      })
        .addTo(locationLayerRef.current);
    });
    staticCacheRef.current.locations = true;
  }, [locations, worldSize, locationMap]);

  // ── Structures as vector geometry (road-like visual quality) ───────────────────────────
  useEffect(() => {
    if (staticCacheRef.current.structures) return; // already rendered for this world
    structureLayerRef.current.clearLayers();
    if (structures.length === 0) return;
    const scale = 100 / worldSize;
    const canvas = canvasRef.current ?? undefined;

    structures.forEach(s => {
      if (s.posX === 0 && s.posY === 0) return;
      if (s.width <= 0 || s.length <= 0) return;

      const minDim = Math.min(s.width, s.length);
      const maxDim = Math.max(s.width, s.length);
      const aspect = maxDim / Math.max(minDim, 0.01);
      const area = s.width * s.length;

      // Skip tiny artifacts/noise.
      if (area < 0.8) return;

      const isLine = minDim < 1.2 || aspect >= 5.0;
      if (isLine) {
        const cx = s.posX * scale;
        const cy = s.posY * scale;
        const halfLong = ((s.width >= s.length ? s.width : s.length) / 2) * scale;
        const a = (s.dir * Math.PI) / 180;
        const dx = Math.cos(a) * halfLong;
        const dy = Math.sin(a) * halfLong;
        L.polyline(
          [[cy - dy, cx - dx], [cy + dy, cx + dx]],
          {
            color: '#6f7b87',
            weight: 0.9,
            opacity: 0.88,
            interactive: false,
            pane: 'athena-structure',
            renderer: canvas,
          }
        ).addTo(structureLayerRef.current);
        return;
      }

      const corners = rotatedStructureRect(s, scale);
      const isBuilding = area >= 40;
      L.polygon(corners, {
        color: '#5b6b7d',
        weight: isBuilding ? 1.0 : 0.85,
        opacity: 0.92,
        fill: isBuilding,
        fillColor: '#78889a',
        fillOpacity: 0.55,
        interactive: false,
        pane: 'athena-structure',
        renderer: canvas,
      }).addTo(structureLayerRef.current);
    });
    staticCacheRef.current.structures = true;
  }, [structures, worldSize]);

  // â”€â”€ Group waypoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    groupLayerRef.current.clearLayers();
    waypointLayerRef.current.clearLayers();
    const scale = 100 / worldSize;
    Object.values(groups).forEach(grp => {
      const members = Object.values(units).filter(u => u.groupId === grp.id);
      if (members.length === 0) return;
      const leader = members.find(u => u.id === grp.leaderId);
      const playerMember = members.find(u => u.playerName?.trim());
      const mountedMember = members.find(u => !!u.vehicleId);
      const anchorUnit = mountedMember ?? playerMember ?? leader ?? members[0];
      const mountedVehicle = anchorUnit.vehicleId ? vehicles[anchorUnit.vehicleId] : undefined;
      const posX = mountedVehicle?.posX ?? anchorUnit.posX;
      const posY = mountedVehicle?.posY ?? anchorUnit.posY;
      if (posX === 0 && posY === 0) return;
      const ll: [number, number] = [posY * scale, posX * scale];
      const side = anchorUnit.side ?? 'unknown';
      const groupCount = members.length;
      const groupType = resolveGroupType(members, vehicles, vehicleMap);

      // ── Waypoint line + endpoint ── (only for explicit orders, not formation positions)
      if (grp.wpX !== 0 || grp.wpY !== 0) {
        const wpLL: [number, number] = [grp.wpY * scale, grp.wpX * scale];
        const wpType = grp.wpType || 'MOVE';
        const { color, endColor, endIcon } = waypointStyle(wpType);
        const wpLabel = wpType.toUpperCase();
        // Dashed line from group to waypoint
        L.polyline([ll, wpLL], {
          color, weight: 2, dashArray: '6,4', opacity: 0.85, pane: 'athena-waypoint', interactive: false,
        }).addTo(waypointLayerRef.current);
        // Endpoint circle + type label
        L.marker(wpLL, {
          pane: 'athena-waypoint',
          interactive: false,
          icon: L.divIcon({
            className: '',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            html: `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="${endColor}" stroke="#000" stroke-width="1.5"/>${endIcon}</svg>`
              + `<div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:9px;font-weight:700;color:${color};text-shadow:-1px 0 #000,1px 0 #000,0 -1px #000,0 1px #000;letter-spacing:0.5px;pointer-events:none">${wpLabel}</div>`,
          }),
        }).addTo(waypointLayerRef.current);
      }

      L.marker(ll, { icon: groupIcon(side, groupCount, groupType), pane: 'athena-group' })
        .bindTooltip(`<b>${escapeHtml(groupLabel(grp))}</b><br>${groupType} (${groupCount})${grp.wpType ? `<br>WP: ${grp.wpType}` : ''}`)
        .addTo(groupLayerRef.current);
      // Group name + unit info label below marker
      const leaderUnit = leader ?? members[0];
      const rankStr = shortRank(leaderUnit.rank);
      const nameStr = escapeHtml(leaderUnit.playerName?.trim() || leaderUnit.name || '');
      const unitInfo = rankStr ? `(${rankStr}) ${nameStr}` : nameStr;
      L.marker(ll, {
        pane: 'athena-group',
        interactive: false,
        icon: L.divIcon({
          className: '',
          iconSize: [0, 0],
          iconAnchor: [-26, 0],
          html: `<div class="map-marker-label map-marker-label-group">${escapeHtml(groupLabel(grp))}<br><span style="font-weight:400;font-size:10px">${unitInfo}</span></div>`,
        }),
      }).addTo(groupLayerRef.current);
    });
  }, [groups, units, vehicles, worldSize, vehicleMap]);

  // â”€â”€ Vehicle markers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    vehicleLayerRef.current.clearLayers();
    const scale = 100 / worldSize;
    const zoom = mapZoom;
    // Crew labels visible at display zoom >= 2.5x (internal zoom >= 9.2)
    const showCrew = zoom >= 9.2;
    Object.values(vehicles).forEach(veh => {
      if (veh.posX === 0 && veh.posY === 0) return;
      const ll: [number, number] = [veh.posY * scale, veh.posX * scale];
      // Resolve crew from units referencing this vehicle (crew array may be empty in live data)
      const occupants = Object.values(units).filter(u => u.vehicleId === veh.id);
      const crewNames = occupants.map(u => `${u.name} (${u.type})`).join(', ');
      const category = resolveVehicleCategory(veh.class, vehicleMap);
      L.marker(ll, { icon: vehicleIcon(veh, units, category), pane: 'athena-vehicle' })
        .bindTooltip(`<b>${veh.class}</b><br>${crewNames}`, { sticky: true })
        .addTo(vehicleLayerRef.current);
      // Crew role labels at high zoom (C: Commander, G: Gunner, D: Driver)
      if (showCrew && occupants.length > 0) {
        const rolePrefix: Record<string, string> = { driver: 'D', gunner: 'G', commander: 'C', turret: 'T', cargo: 'P' };
        const roleOrder = Object.keys(rolePrefix);
        const sorted = [...occupants].sort((a, b) => {
          const ai = roleOrder.findIndex(r => a.type.toLowerCase().includes(r));
          const bi = roleOrder.findIndex(r => b.type.toLowerCase().includes(r));
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        const lines = sorted.map(u => {
          const rKey = roleOrder.find(r => u.type.toLowerCase().includes(r)) ?? 'cargo';
          const prefix = rolePrefix[rKey] ?? 'P';
          const name = u.playerName?.trim() || u.name || '';
          return `${prefix}: ${escapeHtml(name)}`;
        }).join('<br>');
        L.marker(ll, {
          pane: 'athena-vehicle',
          interactive: false,
          icon: L.divIcon({
            className: '',
            iconSize: [0, 0],
            iconAnchor: [-30, -4],
            html: `<div class="map-marker-label map-marker-label-crew">${lines}</div>`,
          }),
        }).addTo(vehicleLayerRef.current);
      }
    });
  }, [vehicles, units, worldSize, vehicleMap, mapZoom]);

  // â”€â”€ Unit markers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    unitLayerRef.current.clearLayers();
    const scale = 100 / worldSize;
    Object.values(units).forEach(unit => {
      const mountedVehicle = unit.vehicleId ? vehicles[unit.vehicleId] : undefined;
      // Bus/in-game behavior: mounted infantry/pilots are represented by the vehicle icon only.
      if (mountedVehicle) return;
      const posX = unit.posX;
      const posY = unit.posY;
      if (posX === 0 && posY === 0) return;
      const ll: [number, number] = [posY * scale, posX * scale];
      const markerIcon = unitIcon(unit);
      L.marker(ll, { icon: markerIcon, pane: 'athena-unit' })
        .bindTooltip(`<b>${unit.name}</b><br>${unit.side} Â· ${unit.rank}<br>${unit.type}`, { sticky: true })
        .addTo(unitLayerRef.current);
    });
  }, [units, vehicles, worldSize, vehicleMap]);

  return null;
}

// â”€â”€ Main map component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface MapProps {
  units:      Record<string, Unit>;
  vehicles:   Record<string, Vehicle>;
  groups:     Record<string, Group>;
  worldSize?: number;
  world?:     string;
  roads:      Road[];
  forests:    ForestsData | null;
  locations:  MapLocation[];
  structures: MapStructure[];
  elevations: ElevationsData | null;
  contours:   ContourLine[];
  layers:     LayerVisibility;
  onLayersChange?: Dispatch<SetStateAction<LayerVisibility>>;
  renderMode?: RenderMode;
  vehicleMap?:  Map<string, string>;
  locationMap?: Map<string, { DrawStyle: string; SizeText: number; Name: string }>;
  onRegisterFocus?: (fn: (posX: number, posY: number) => void) => void;
}

// ── Vertical zoom slider rendered inside the MapContainer (has access to the Leaflet map) ──
function ZoomSliderControl() {
  const map = useMap();
  // Keep zoom focused on useful tactical ranges:
  // remove very far-out views, allow much deeper zoom-in, and use fine increments.
  // BASE_ZOOM=3 keeps the displayed x-scale stable vs previous behavior.
  const MIN_ZOOM = 3, MAX_ZOOM = 10.5, ZOOM_STEP = 0.1;
  const [zoom, setZoom] = useState(() => map.getZoom());
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Prevent Leaflet from consuming mouse/wheel/touch events on the slider
  useEffect(() => {
    if (!containerRef.current) return;
    L.DomEvent.disableClickPropagation(containerRef.current);
    L.DomEvent.disableScrollPropagation(containerRef.current);
    const el = containerRef.current;
    const stopWheel = (e: WheelEvent) => e.stopPropagation();
    el.addEventListener('wheel', stopWheel, { passive: false });
    return () => el.removeEventListener('wheel', stopWheel);
  }, []);

  // Keep slider in sync when map zoom changes from scroll wheel / other sources
  useEffect(() => {
    const onZoom = () => {
      if (isDragging.current) return;
      setZoom(Math.round(map.getZoom() / ZOOM_STEP) * ZOOM_STEP);
    };
    map.on('zoomend', onZoom);
    return () => { map.off('zoomend', onZoom); };
  }, [map]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const z = parseFloat(e.target.value);
    setZoom(z);
    map.setZoom(z, { animate: false });
  };

  const t = (zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
  const scale = 0.1 + t * (3.0 - 0.1);
  const scaleLabel = `${Math.round(scale * 10) / 10}`;

  return (
    <div ref={containerRef} style={{
      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
      zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 4, pointerEvents: 'auto',
      background: 'rgba(0,0,0,0.35)', borderRadius: 8, padding: '8px 6px',
    }}>
      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>+</span>
      <input
        type="range"
        min={MIN_ZOOM} max={MAX_ZOOM} step={ZOOM_STEP}
        value={zoom}
        onMouseDown={() => { isDragging.current = true; }}
        onMouseUp={()   => { isDragging.current = false; }}
        onTouchStart={() => { isDragging.current = true; }}
        onTouchEnd={()   => { isDragging.current = false; }}
        onChange={handleChange}
        style={{
          writingMode: 'vertical-lr' as React.CSSProperties['writingMode'],
          direction: 'rtl' as React.CSSProperties['direction'],
          height: 260, width: 36,
          cursor: 'pointer', opacity: 0.85, accentColor: '#ccc',
          touchAction: 'none',
        }}
      />
      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>−</span>
      <span style={{
        color: '#fff', fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
        marginTop: 2, minWidth: 36, textAlign: 'center',
      }}>{scaleLabel}×</span>
    </div>
  );
}

// ── Focus bridge — lets sidebar pan the map to a world coordinate ──────────
function FocusBridge({ worldSize, onRegisterFocus }: { worldSize: number; onRegisterFocus: (fn: (posX: number, posY: number) => void) => void }) {
  const map = useMap();
  useEffect(() => {
    onRegisterFocus((posX: number, posY: number) => {
      const scale = 100 / worldSize;
      map.setView([posY * scale, posX * scale], 10.5, { animate: true });
    });
  }, [map, worldSize, onRegisterFocus]);
  return null;
}

export function AthenaMap({
  units, vehicles, groups,
  world = '', worldSize = 10240,
  roads = [], forests = null, locations = [], structures = [], elevations = null, contours = [],
  layers, onLayersChange, renderMode = '2d',
  vehicleMap = new Map(), locationMap = new Map(),
  onRegisterFocus,
}: MapProps) {
  const bounds: L.LatLngBoundsExpression = [[0, 0], [100, 100]];

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <MapContainer
      center={[50, 50]}
      zoom={4}
      minZoom={3}
      maxZoom={10.5}
      maxBounds={bounds}
      maxBoundsViscosity={1}
      style={{ width: '100%', height: '100%', background: '#111' }}
      crs={L.CRS.Simple}
      zoomControl={false}
      zoomSnap={0.1}
      zoomDelta={0.25}
      wheelPxPerZoomLevel={80}
    >
      <ZoomSliderControl />
      {onRegisterFocus && <FocusBridge worldSize={worldSize} onRegisterFocus={onRegisterFocus} />}
      <LayerManager
        units={units}
        vehicles={vehicles}
        groups={groups}
        world={world}
        worldSize={worldSize}
        roads={roads}
        forests={forests}
        locations={locations}
        structures={structures}
        elevations={elevations}
        contours={contours}
        layers={layers}
        onLayersChange={onLayersChange}
        renderMode={renderMode}
        vehicleMap={vehicleMap}
        locationMap={locationMap}
      />
    </MapContainer>
    </div>
  );
}
