// C-07 Shared route — friend's live view, no sign-in (Figma: EN · C-07 Shared route)
import { useEffect, useState } from 'react';
import { Marker, Polyline, Tooltip } from 'react-leaflet';
import { useParams } from 'react-router-dom';
import { getSharedTrip } from '../api';
import { APP_NAME, SHARED_POLL_SEC } from '../core/config';
import type { SharedTrip } from '../core/types';
import { Icon } from '../components/Icon';
import { FitBounds, MapView, token } from '../components/MapView';
import { meIcon } from '../components/ReportMarkers';
import { ErrorBox, SimChip, errKey } from '../components/ui';
import { fmtTime } from '../components/geo';
import { useT } from '../i18n';

export default function SharedTripPage() {
  const { token: tk = '' } = useParams(); const { t, lang } = useT();
  const [d, setD] = useState<SharedTrip | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => getSharedTrip(tk).then((x) => { if (alive) { setD(x); setErr(null); } }).catch((e) => alive && setErr(t(errKey(e))));
    load(); const id = setInterval(load, SHARED_POLL_SEC * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [tk, t]);

  const header = (
    <header className="flex min-h-[72px] items-center gap-2 bg-surface px-6 pt-[max(1.75rem,env(safe-area-inset-top))]">
      <h1 className="h-title flex-1 truncate">{APP_NAME} · {t('c07.title')}</h1>
      <span className="flex items-center gap-1.5 rounded-card bg-primary-soft px-2.5 py-1.5 text-[10px] text-safe"><Icon name="lock" size={15} />{t('c07.noSignIn')}</span>
    </header>
  );
  if (err && !d) return <div className="h-full">{header}<div className="p-6"><ErrorBox message={err} /></div></div>;
  if (!d) return <div className="h-full">{header}<p className="p-6 text-muted">{t('common.loading')}</p></div>;

  const name = d.display_name; const late = d.status === 'active' && d.is_late;
  const minsLeft = Math.max(0, Math.round((new Date(d.eta).getTime() - Date.now()) / 60e3));
  const overdue = Math.max(0, Math.round((Date.now() - new Date(d.eta).getTime()) / 60e3));
  const updatedAgo = d.last_location ? Math.round((Date.now() - new Date(d.last_location.recorded_at).getTime()) / 60e3) : null;
  const banner = d.sos ? { cls: 'bg-danger', title: t('c07.sosTitle', { name }), sub: t('c07.sosBody') }
    : d.status === 'arrived' ? { cls: 'bg-safe-line', title: t('c07.arrived', { name }), sub: t('c07.endedBody') }
    : d.status === 'cancelled' ? { cls: 'bg-muted', title: t('c07.cancelled'), sub: t('c07.endedBody') }
    : late ? { cls: 'bg-caution-line', title: t('c07.lateTitle'), sub: t('c07.lateBody', { n: overdue }) }
    : { cls: 'bg-primary', title: t('c07.onTheWay', { name }), sub: `${t('c07.walkingHome')} · ${updatedAgo == null || updatedAgo < 1 ? t('c07.justNow') : t('c07.minAgo', { n: updatedAgo })}` };

  return (
    <div className="flex h-full flex-col bg-surface">
      {header}
      <div className="relative flex-1">
        <div className="absolute inset-0">
          <MapView>
            <Polyline positions={d.route_geometry} pathOptions={{ color: '#fff', weight: 11 }} />
            <Polyline positions={d.route_geometry} pathOptions={{ color: token('--color-route-safe'), weight: 6 }} />
            <FitBounds points={d.route_geometry} />
            {d.last_location && <Marker position={[d.last_location.lat, d.last_location.lng]} icon={meIcon}>
              <Tooltip permanent direction="right" offset={[22, 0]} className="route-label">{name} · {fmtTime(d.last_location.recorded_at, lang)}</Tooltip>
            </Marker>}
          </MapView>
        </div>
        <div role={d.sos || late ? 'alert' : 'status'} className={`absolute inset-x-6 top-2 z-[500] rounded-card px-[17px] py-3 text-on-primary shadow-float ${banner.cls}`}>
          <p className="flex items-center gap-3 text-lg font-bold"><span className="h-2 w-2 rounded-full bg-on-primary" />{banner.title}</p>
          <p className="mt-1 text-[11px]">{banner.sub}</p>
        </div>
        <SimChip className="absolute bottom-8 left-6 z-[500]" />
      </div>
      <div className="sheet relative z-[600] -mt-5 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
        <div className="sheet-handle" />
        <div className="mt-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-bold">{t('c07.eta', { time: fmtTime(d.eta, lang) })}</p>
            <p className="mt-1 text-[13px] text-muted">{t('c07.toPlace', { place: d.destination_label })}{d.status === 'active' && ` · ${t('c07.about', { n: minsLeft })}`}</p>
          </div>
          <a href="tel:" className="btn min-h-11 bg-primary px-4 text-[13px] text-on-primary"><Icon name="phone" size={18} />{t('c07.contact')}</a>
        </div>
        <p className="mt-4 text-[11px] text-muted">{t('c07.autoStop')}</p>
        {d.sos && d.sos.lat != null && <a className="mt-3 flex min-h-11 items-center gap-2 rounded-card bg-danger-soft px-4 text-xs font-medium text-danger-text" href={`https://maps.google.com/?q=${d.sos.lat},${d.sos.lng}`} target="_blank" rel="noreferrer"><Icon name="pin" size={18} />{t('c07.sosLocation')}</a>}
        <p className="mt-6 flex items-center justify-center gap-2 text-[10px] text-muted"><Icon name="lock" size={14} />{t('c07.expires')}</p>
      </div>
    </div>
  );
}
