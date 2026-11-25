// C-04 Safety score details (Figma: EN · C-04 Safety score)
import { useEffect, useState } from 'react';
import L from 'leaflet';
import { Marker, Polyline } from 'react-leaflet';
import { Navigate, useParams } from 'react-router-dom';
import { planRoutes } from '../api';
import { SCORE_WEIGHTS } from '../core/config';
import type { Factors, RouteKind } from '../core/types';
import { Icon } from '../components/Icon';
import { FitBounds, MapView, token } from '../components/MapView';
import { pts, reasonText, sortReasons, TopBar, toneText, scoreTone, ReasonList } from '../components/ui';
import { fmtTime } from '../components/geo';
import { useT } from '../i18n';
import { useStore } from '../state/store';

const FACTORS: (keyof typeof SCORE_WEIGHTS)[] = ['lighting', 'activity', 'help_access'];

export default function RouteDetailPage() {
  const { kind } = useParams<{ kind: RouteKind }>(); const { t, lang } = useT(); const { plan, origin, destination, departure } = useStore();
  const [later, setLater] = useState<number | null>(null);
  const dep = departure ? new Date(departure) : new Date();
  const laterDate = new Date(dep.getTime() + 3600e3);
  useEffect(() => {
    if (!origin || !destination || (kind !== 'fastest' && kind !== 'safest')) return;
    planRoutes({ origin, destination, departure_at: laterDate }).then((p) => setLater(p[kind].score)).catch(() => undefined);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!plan || (kind !== 'fastest' && kind !== 'safest')) return <Navigate to="/plan" replace />;

  const r = plan[kind]; const tone = scoreTone(r.score);
  const f: Factors = r.factors;
  const weighted = Math.round(20 + 80 * FACTORS.reduce((s, k) => s + SCORE_WEIGHTS[k] * f[k], 0)); // same 1-5 -> pts mapping as pts()
  const penaltyPts = Math.max(0, weighted - pts(r.score));
  const reports = r.reasons.find((x) => x.code === 'CONFIRMED_REPORTS')?.count ?? 0;
  const best = r.reasons.find((x) => x.tone === 'good') ?? sortReasons(r.reasons)[0];
  // Mock has no per-segment geometry; highlight the middle stretch of the route as the weakest section.
  const g = r.geometry; const watch = g.length > 2 ? g.slice(Math.floor(g.length / 2) - 1, Math.floor(g.length / 2) + 1) : g;
  const watchReason = r.reasons.find((x) => x.code === 'DARK_STRETCH' || x.code === 'QUIET_STRETCH');
  const watchIcon = L.divIcon({ className: '', iconAnchor: [-8, 23], html: `<span class="map-label" style="display:inline-flex;gap:8px;align-items:center;font-size:10px;font-weight:500"><span style="color:rgb(var(--color-caution-line))">⚠</span>${watchReason ? reasonText(t, watchReason) : r.worst_segment ? t('c04.worstBody', { name: r.worst_segment.name ?? '—', score: pts(r.worst_segment.score) }) : ''}</span>` });
  const hasWatch = !!(watchReason || r.worst_segment);

  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('c04.title')} />
      <div className="flex-1 overflow-y-auto px-6 pb-10">
        <section className="mt-6 flex items-center gap-6 rounded-card bg-primary-soft px-[18px] py-4">
          <div className="shrink-0">
            <p className={`text-[13px] font-medium ${kind === 'safest' ? 'text-safe' : 'text-caution'}`}>{t(`kind.${kind}`)}</p>
            <p className="flex items-baseline gap-2"><span className={`text-[52px] font-bold leading-[1.2] ${toneText[tone]}`}>{r.data_limited ? '~' : ''}{pts(r.score)}</span><span className="text-sm text-muted">/ 100</span></p>
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold leading-snug">{best ? reasonText(t, best) : ''}</p>
            <p className="mt-1 text-xs text-muted">{t('c04.forDeparture', { time: fmtTime(dep, lang) })}</p>
          </div>
        </section>

        <h2 className="mt-6 text-lg font-bold">{t('c04.how')}</h2>
        <div className="mt-4 space-y-5">
          {FACTORS.map((k) => (
            <div key={k} className="grid grid-cols-[101px_1fr_57px] items-start">
              <span className="text-xs font-medium">{t(`factor.${k}`)}</span>
              <div>
                <div className="mt-[7px] h-[7px] rounded bg-line"><div className="h-full rounded bg-safe-line" style={{ width: `${f[k] * 100}%` }} /></div>
                <p className="mt-1 text-[9px] text-muted">{Math.round(SCORE_WEIGHTS[k] * 100)}%</p>
              </div>
              <span className="text-right text-xs font-bold">{Math.round(f[k] * 100)} {t('common.pts')}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex h-[42px] items-center gap-3 rounded-card bg-caution-soft px-3">
          <Icon name="alert" size={17} className="text-caution-line" />
          <span className="flex-1 text-xs font-medium">{t('c04.reports', { count: reports })}</span>
          <span className="text-xs font-bold text-caution">−{penaltyPts} {t('common.pt')}</span>
        </div>
        <p className="mt-2.5 text-[11px] text-muted">{t('c04.formula', { w: weighted, p: penaltyPts, s: pts(r.score) })}</p>

        {hasWatch && <>
          <h2 className="mt-7 text-[17px] font-bold">{t('c04.watch')}</h2>
          <div className="mt-4 h-[136px] overflow-hidden rounded-card">
            <MapView zoom={17}>
              <Polyline positions={g} pathOptions={{ color: token('--color-route-safe'), weight: 5 }} />
              <Polyline positions={watch} pathOptions={{ color: token('--color-caution-line'), weight: 6 }} />
              <Marker position={watch[watch.length - 1]} icon={watchIcon} />
              <FitBounds points={watch.length > 1 ? watch : g} />
            </MapView>
          </div>
        </>}

        <section className="mt-5 rounded-card bg-primary-soft px-4 py-4">
          <p className="text-sm font-bold">{t('c04.nightTitle')}</p>
          <p className="mt-1.5 text-xs text-muted">{t('c04.nightBody')}</p>
          <p className="mt-2 whitespace-pre text-xs font-bold text-safe">
            {fmtTime(dep, lang)}  {pts(r.score)} {t('common.pts')}    →    {fmtTime(laterDate, lang)}  {later == null ? '…' : `${pts(later)} ${t('common.pts')}`}
          </p>
        </section>

        <h2 className="mt-7 text-[17px] font-bold">{t('c04.reasons')}</h2>
        <div className="mt-3 rounded-card bg-surface p-4"><ReasonList reasons={r.reasons} /></div>
        <p className="mt-4 text-center text-[10px] text-muted">{t('c04.footer')}</p>
      </div>
    </div>
  );
}
