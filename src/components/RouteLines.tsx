import L from 'leaflet';
import { Marker, Polyline, Tooltip } from 'react-leaflet';
import type { PlanResult, RouteKind } from '../core/types';
import { useT } from '../i18n';
import { token } from './MapView';

const startIcon = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: '<span style="display:block;width:22px;height:22px;border-radius:50%;background:rgb(var(--color-primary));border:5px solid #fff;box-shadow:0 2px 6px rgb(38 51 72/.25)"></span>' });
const endIcon = L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: '<span style="display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgb(38 51 72/.25)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(38,51,72)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></span>' });

/** Fastest = amber (--color-route-fast), safest = green (--color-route-safe), each with a white casing like the design. */
export function RouteLines({ plan, selected, onSelect, labels = false }: { plan: PlanResult; selected: RouteKind; onSelect?: (k: RouteKind) => void; labels?: boolean }) {
  const { t } = useT();
  const kinds: RouteKind[] = plan.same_route ? ['safest'] : selected === 'safest' ? ['fastest', 'safest'] : ['safest', 'fastest'];
  const g = plan.safest.geometry;
  return (
    <>
      {kinds.map((k) => {
        const r = plan[k]; const active = k === selected; const mid = r.geometry[Math.floor(r.geometry.length / 2)];
        const color = token(k === 'fastest' ? '--color-route-fast' : '--color-route-safe', active ? 1 : 0.7);
        return (
          <span key={k}>
            <Polyline positions={r.geometry} pathOptions={{ color: '#fff', weight: active ? 11 : 9, lineJoin: 'round' }} eventHandlers={{ click: () => onSelect?.(k) }} />
            <Polyline positions={r.geometry} pathOptions={{ color, weight: active ? 6 : 5, lineJoin: 'round' }} eventHandlers={{ click: () => onSelect?.(k) }}>
              {labels && <Tooltip permanent direction={k === 'fastest' ? 'left' : 'right'} position={mid} className="route-label" offset={[k === 'fastest' ? -8 : 8, 0]}>
                <span className={k === 'fastest' ? 'text-caution' : 'text-text'}>{t(k === 'fastest' ? 'c03.mapFast' : 'c03.mapSafe', { n: Math.round(r.duration_s / 60) })}</span>
              </Tooltip>}
            </Polyline>
          </span>
        );
      })}
      <Marker position={g[0]} icon={startIcon} />
      <Marker position={g[g.length - 1]} icon={endIcon} />
    </>
  );
}
