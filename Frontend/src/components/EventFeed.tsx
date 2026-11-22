/**
 * Kill feed and "Recent Shots" list in the right sidebar (AR-only: kill and
 * fired events come from the AR extension's event handlers, which Athena Web 2's
 * relay doesn't provide, so this stays outside the shared core).
 *
 * Data: `kills` / `fired` are the rolling lists from `adapter/useAthenaHub`
 * (SignalR `Killed` / `Fired` events, newest first).
 */
import type { KilledEvent, FiredEvent } from '../core/types/game';

interface Props {
  /** Newest-first kill events. */
  kills: KilledEvent[];
  /** Newest-first fired events (one per projectile; deduplicated in `handleFired.sqf`). */
  fired: FiredEvent[];
}

/** Maximum number of shots listed; older entries stay in the hub's buffer for projectile tracking. */
const MAX_SHOTS_LISTED = 30;

/**
 * Flat line icon for the section headers. Replaces the earlier emoji (☠ / 🔫),
 * which render as cartoon glyphs (a water pistol on most platforms) and clash
 * with the map's flat "military nav" style. Strokes use `currentColor`, so the
 * icon takes the header colour.
 *
 * @param kind 'kill' = target with a cross, 'shot' = crosshair reticle
 */
function HeaderIcon({ kind }: { kind: 'kill' | 'shot' }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square"
      style={{ verticalAlign: '-2px', marginRight: 6 }}
    >
      {kind === 'shot' ? (
        <>
          <circle cx="8" cy="8" r="5" />
          <path d="M8 1v4M8 11v4M1 8h4M11 8h4" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </>
      )}
    </svg>
  );
}

export function EventFeed({ kills, fired }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', overflowY: 'auto' }}>
      <div>
        <h3 style={{ color: '#e74c3c', margin: '0 0 6px' }}><HeaderIcon kind="kill" />Kills</h3>
        {kills.length === 0 && <p style={{ color: '#888', fontSize: 12 }}>No kills yet</p>}
        {kills.map((k, i) => (
          <div key={i} style={{ padding: '4px 8px', background: '#2a1a1a', borderRadius: 4, marginBottom: 4, fontSize: 12 }}>
            <span style={{ color: '#e74c3c' }}><b>{k.killer || '?'}</b></span>
            {' '}eliminated{' '}
            <span style={{ color: '#fff' }}><b>{k.victim}</b></span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <h3 style={{ color: '#f39c12', margin: '0 0 6px' }}><HeaderIcon kind="shot" />Recent Shots</h3>
        {fired.length === 0 && <p style={{ color: '#888', fontSize: 12 }}>No shots fired</p>}
        {fired.slice(0, MAX_SHOTS_LISTED).map((f, i) => (
          <div key={i} style={{ padding: '2px 8px', background: '#1a1a2a', borderRadius: 4, marginBottom: 2, fontSize: 11 }}>
            <span style={{ color: '#f39c12' }}>{f.weapon}</span> · {f.ammo}
          </div>
        ))}
      </div>
    </div>
  );
}
