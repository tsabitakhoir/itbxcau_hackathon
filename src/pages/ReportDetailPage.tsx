// S-05 Report detail + confirm
import { useEffect, useState } from 'react';
import { Marker } from 'react-leaflet';
import { useParams } from 'react-router-dom';
import L from 'leaflet';
import { confirmReport, listReports } from '../api';
import { CONFIRM_THRESHOLD } from '../core/config';
import type { Report } from '../core/types';
import { Icon } from '../components/Icon';
import { MapView } from '../components/MapView';
import { ErrorBox, HazardBadge, SimChip, Skeleton, TopBar, errKey } from '../components/ui';
import { fmtTime } from '../components/geo';
import { renderToStaticMarkup } from 'react-dom/server';
import { useT } from '../i18n';

export default function ReportDetailPage() {
  const { id = '' } = useParams(); const { t, lang } = useT();
  const [r, setR] = useState<Report | null | undefined>(undefined); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = () => listReports().then((l) => setR(l.find((x) => x.id === id) ?? null)).catch((e) => setErr(t(errKey(e))));
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function confirm() { setBusy(true); setErr(null); try { await confirmReport(id); await load(); } catch (e) { setErr(t(errKey(e))); } finally { setBusy(false); } }
  if (r === undefined) return <div className="p-6"><Skeleton className="h-48" /></div>;
  if (r === null) return <div className="h-full"><TopBar title={t('s05.detail')} /><div className="p-6"><ErrorBox message={t('error.NOT_FOUND')} /></div></div>;
  const icon = L.divIcon({ className: '', iconSize: [32, 32], iconAnchor: [16, 16], html: renderToStaticMarkup(<HazardBadge tone={r.confirmed ? 'danger' : 'caution'} />) });
  const days = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 864e5);
  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('s05.detail')} right={r.simulated ? <SimChip className="mr-3" /> : undefined} />
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <div className="h-44 overflow-hidden rounded-card"><MapView center={[r.lat, r.lng]} zoom={17}><Marker position={[r.lat, r.lng]} icon={icon} /></MapView></div>
        <div className="mt-5 flex items-center gap-3">
          <HazardBadge tone={r.confirmed ? 'danger' : 'caution'} size={40} />
          <div><p className="text-xl font-bold">{t(`category.${r.category}`)}</p><p className="text-xs text-muted">{days > 0 ? t('s05.daysAgo', { n: days }) : fmtTime(r.created_at, lang)}</p></div>
        </div>
        {r.note && <p className="mt-4 rounded-card bg-surface-2 p-4 text-sm">{r.note}</p>}
        {(r.photo_urls?.length ? r.photo_urls : r.photo_url ? [r.photo_url] : []).map((u, i) => <img key={i} src={u} alt="" className="mt-4 max-h-56 w-full rounded-card object-cover" />)}
        <div className={`mt-4 rounded-card p-4 ${r.confirmed ? 'bg-danger-soft' : 'bg-caution-soft'}`}>
          <p className={`text-sm font-bold ${r.confirmed ? 'text-danger-text' : 'text-caution'}`}>{t(r.confirmed ? 's05.confirmed' : 's05.pending')}</p>
          <div className="mt-2 h-[7px] rounded bg-line"><div className={`h-full rounded ${r.confirmed ? 'bg-danger' : 'bg-caution-line'}`} style={{ width: `${Math.min(1, r.confirm_count / CONFIRM_THRESHOLD) * 100}%` }} /></div>
          <p className="mt-1.5 text-[11px] text-muted">{t('s05.confirmations', { count: r.confirm_count, n: CONFIRM_THRESHOLD })}</p>
        </div>
        {err && <div className="mt-3"><ErrorBox message={err} /></div>}
      </div>
      <div className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {r.is_mine ? <p className="rounded-card bg-primary-soft p-4 text-center text-sm text-muted">{t('s05.yours')}</p>
          : r.confirmed_by_me ? <p className="flex items-center justify-center gap-2 rounded-card bg-safe-soft p-4 text-sm font-bold text-safe"><Icon name="check" size={18} />{t('s05.youConfirmed')}</p>
          : <button className="btn-primary w-full" disabled={busy} onClick={confirm}>{t('s05.confirm')}</button>}
      </div>
    </div>
  );
}
