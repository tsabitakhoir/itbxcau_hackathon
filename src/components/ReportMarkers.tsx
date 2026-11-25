import L from 'leaflet';
import { renderToStaticMarkup } from 'react-dom/server';
import { Marker, Tooltip } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import type { Report } from '../core/types';
import { useT } from '../i18n';
import { HazardBadge } from './ui';

/** Hazard markers from the design: red rounded square for confirmed hazards, amber for other/unconfirmed (dashed outline). */
function icon(r: Report) {
  const tone = r.category === 'other' || !r.confirmed ? 'caution' : 'danger';
  const html = renderToStaticMarkup(<span style={{ display: 'block', opacity: r.confirmed ? 1 : 0.75, outline: r.confirmed ? 'none' : '2px dashed rgb(var(--color-text-muted))', outlineOffset: 2, borderRadius: 9 }}><HazardBadge tone={tone} /></span>);
  return L.divIcon({ html, className: '', iconSize: [32, 32], iconAnchor: [16, 16] });
}

export function ReportMarkers({ reports }: { reports: Report[] }) {
  const nav = useNavigate(); const { t } = useT();
  return <>{reports.map((r) => (
    <Marker key={r.id} position={[r.lat, r.lng]} icon={icon(r)} eventHandlers={{ click: () => nav(`/report/${r.id}`) }}>
      <Tooltip direction="top" offset={[0, -16]}>{t(`category.${r.category}`)}</Tooltip>
    </Marker>
  ))}</>;
}

/** "Me" marker: blue dot with soft halo (design 50px group). */
export const meIcon = L.divIcon({
  className: '', iconSize: [50, 50], iconAnchor: [25, 25],
  html: '<span style="display:grid;place-items:center;width:50px;height:50px;border-radius:50%;background:rgb(var(--color-primary)/.35)"><span style="width:22px;height:22px;border-radius:50%;background:rgb(var(--color-primary));border:4px solid #fff"></span></span>',
});
