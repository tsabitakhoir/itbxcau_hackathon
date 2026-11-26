// C-04 Route details / safety score (Figma: C-04 Route details · EN, node 64:277)
import { useEffect, useState, type ReactNode } from 'react';
import L from 'leaflet';
import { Marker, Polyline } from 'react-leaflet';
import { Navigate, useParams } from 'react-router-dom';
import { planRoutes } from '../api';
import { SCORE_BANDS, SCORE_WEIGHTS } from '../core/config';
import type { Factors, RouteKind, RouteOption, WatchArea } from '../core/types';
import { FitBounds, MapView, token } from '../components/MapView';
import { pts, TopBar, scoreTone, ReasonList } from '../components/ui';
import { fmtTime } from '../components/geo';
import { useT } from '../i18n';
import { useStore } from '../state/store';

type FactorKey = keyof typeof SCORE_WEIGHTS;
const FACTORS: FactorKey[] = ['lighting', 'facilities', 'crowd', 'reports'];
const f100 = (v: number) => Math.round(v * 100);
const litPct = (r: RouteOption) => r.reasons.find((x) => x.code === 'LIT_PCT')?.pct ?? f100(r.factors.lighting);
const openCount = (r: RouteOption) => r.reasons.find((x) => x.code === 'OPEN_PLACES')?.count ?? 0;

/** Headline = the strongest factor of the route (or a warning if the score is low). */
function headlineKey(r: RouteOption) {
  if (r.score < SCORE_BANDS.caution) return 'c04.hl.care';
  const best = FACTORS.reduce((a, b) => (r.factors[b] > r.factors[a] ? b : a));
  return `c04.hl.${best}`;
}

export default function RouteDetailPage() {
  const { kind } = useParams<{ kind: RouteKind }>(); const { t, lang } = useT(); const { plan, origin, destination, departure, prefs } = useStore();
  const dep = departure ? new Date(departure) : new Date();
  const [later, setLater] = useState<{ at: Date; score: number } | null>(null);
  const r0 = plan && (kind === 'fastest' || kind === 'safest') ? plan[kind] : null;
  useEffect(() => {
    if (!r0 || !origin || !destination || !kind) return;
    if (r0.score_later) { setLater({ at: new Date(r0.score_later.at), score: r0.score_later.score }); return; }
    const at = new Date(dep.getTime() + 3600e3);
    planRoutes({ origin, destination, departure_at: at, mode: plan?.mode ?? prefs.mode }).then((p) => setLater({ at, score: p[kind].score })).catch(() => undefined);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!plan || !r0 || (kind !== 'fastest' && kind !== 'safest')) return <Navigate to="/plan" replace />;

  const r = r0; const other = plan[kind === 'safest' ? 'fastest' : 'safest'];
  const fast = plan.fastest, safe = plan.safest;
  const f: Factors = r.factors;
  const reports = r.reasons.find((x) => x.code === 'CONFIRMED_REPORTS')?.count ?? 0;
  const wheelchair = (plan.mode ?? prefs.mode) === 'wheelchair';
  const cond = (x: RouteOption) => { const tone = scoreTone(x.score); return <span className={tone === 'safe' ? '' : tone === 'caution' ? 'text-caution' : 'text-danger-text'}>{t(`band.${tone}`)}</span>; };

  // Areas to watch: contract watch_areas, else fall back to worst_segment / the middle stretch.
  const g = r.geometry;
  const areas: WatchArea[] = r.watch_areas?.length ? r.watch_areas
    : r.worst_segment ? [{ segment_id: r.worst_segment.id, name: r.worst_segment.name, kind: 'dark', meters: r.reasons.find((x) => x.code === 'DARK_STRETCH')?.meters ?? 0, score: r.worst_segment.score, at: g[Math.floor(g.length / 2)] }] : [];
  const near = (a: WatchArea) => { let k = 0, d = Infinity; g.forEach((p, i) => { const dd = (p[0] - a.at[0]) ** 2 + (p[1] - a.at[1]) ** 2; if (dd < d) { d = dd; k = i; } }); return g.slice(Math.max(0, k - 1), Math.min(g.length, k + 2)); };
  const areaText = (a: WatchArea) => `${t(`watch.${a.kind}`)}${a.meters ? ` · ${a.meters} m` : ''}${a.name ? ` · ${a.name}` : ''}`;
  const areaIcon = (a: WatchArea) => L.divIcon({ className: '', iconAnchor: [-8, 23], html: `<span class="map-label" style="display:inline-flex;gap:8px;align-items:center;font-size:11px;font-weight:500"><span style="color:rgb(var(--color-caution-line))">⚠</span>${areaText(a)}</span>` });

  const Row = ({ a, label, b }: { a: ReactNode; label: string; b: ReactNode }) => (
    <div className="grid grid-cols-[80px_1fr_80px] items-center text-center"><span className="text-[13px] font-bold text-text-2">{a}</span><span className="text-xs text-muted">{label}</span><span className="text-[13px] font-bold text-primary">{b}</span></div>
  );

  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('c04.title')} />
      <div className="flex-1 overflow-y-auto px-6 pb-10">
        <h2 className="mt-4 text-[26px] font-bold leading-[39px] text-text">{t(headlineKey(r) as 'c04.hl.care')}</h2>
        <section className="mt-5 flex items-center gap-6 rounded-[24px] bg-primary-soft px-5 py-4">
          <div className="shrink-0">
            <p className="text-[13px] text-text-2">{t('c04.safetyScore')}</p>
            <p className="flex items-baseline gap-3"><span className="text-[48px] font-bold leading-[1.3] text-primary">{r.data_limited ? '~' : ''}{pts(r.score)}</span><span className="text-xs text-muted">/ 100</span></p>
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold text-text">{t(`kind.${kind}`)}</p>
            <p className="mt-1.5 text-xs text-muted">{t('c04.forDeparture', { time: fmtTime(dep, lang) })}</p>
          </div>
        </section>

        <h3 className="mt-7 text-lg font-bold text-text">{t('c04.how')}</h3>
        <div className="mt-4 space-y-4">
          {FACTORS.map((k) => (
            <div key={k} className="flex items-center justify-between">
              <div><p className="text-[15px] text-text-2">{t(`factor.${k}`)}</p><p className="text-[11px] text-muted">{t('c04.weight', { n: Math.round(SCORE_WEIGHTS[k] * 100) })}</p></div>
              <span className="text-[15px] font-bold text-primary">{f100(f[k])} {t('common.pts')}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex h-[50px] items-center justify-between rounded-[16px] bg-surface-2 px-4 text-sm">
          <span className="text-text-2">{t('c04.reports', { count: reports })}</span>
          <span className="font-medium text-text-2">{f100(f.reports)} {t('common.pts')}</span>
        </div>
        <p className="mt-3 text-xs text-muted">{t('c04.formula', { s: pts(r.score) })}</p>

        <h3 className="mt-7 text-lg font-bold text-text">{t('c04.compare')}</h3>
        <div className="mt-2 grid grid-cols-[80px_1fr_80px] text-center text-[11px] text-text-2"><span>{t('c04.fast')}</span><span>{t('c04.criteria')}</span><span>{t('c04.safe')}</span></div>
        <div className="mt-4 space-y-4">
          <Row a={`${litPct(fast)}%`} label={t('c03.rowLit')} b={`${litPct(safe)}%`} />
          <Row a={openCount(fast)} label={t('c03.rowOpen')} b={openCount(safe)} />
          <Row a={cond(fast)} label={t('c03.rowNight')} b={cond(safe)} />
          {wheelchair && fast.access && safe.access && <>
            <Row a={fast.access.steps} label={t('c04.rowSteps')} b={safe.access.steps} />
            <Row a={fast.access.lowered_kerbs} label={t('c04.rowKerbs')} b={safe.access.lowered_kerbs} />
            <Row a={fast.access.accessible_toilets} label={t('c04.rowToilets')} b={safe.access.accessible_toilets} />
          </>}
        </div>

        {areas.length > 0 && <>
          <h3 className="mt-8 text-lg font-bold text-text">{t('c04.watch')}</h3>
          <div className="mt-3 h-[136px] overflow-hidden rounded-[24px]">
            <MapView zoom={17}>
              <Polyline positions={g} pathOptions={{ color: token('--color-safe-line'), weight: 5 }} />
              {areas.map((a, i) => <Polyline key={i} positions={near(a)} pathOptions={{ color: token('--color-caution-line'), weight: 6 }} />)}
              <Marker position={areas[0].at} icon={areaIcon(areas[0])} />
              <FitBounds points={near(areas[0]).length > 1 ? near(areas[0]) : g} />
            </MapView>
          </div>
          {areas.length > 1 && <ul className="mt-2 space-y-1 text-xs text-text-2">{areas.slice(1).map((a, i) => <li key={i}>⚠ {areaText(a)}</li>)}</ul>}
        </>}

        <section className="mt-6 rounded-[22px] bg-surface-2 px-[18px] py-4">
          <p className="text-base font-bold text-text">{t('c04.nightTitle')}</p>
          <p className="mt-1.5 text-[13px] text-text-2">{t('c04.nightBody')}</p>
          <p className="mt-2.5 whitespace-pre text-sm font-medium text-primary">
            {fmtTime(dep, lang)}  {pts(r.score)} {t('common.pts')}    →    {later ? `${fmtTime(later.at, lang)}  ${pts(later.score)} ${t('common.pts')}` : '…'}
          </p>
        </section>

        <h3 className="mt-7 text-lg font-bold text-text">{t('c04.reasons')}</h3>
        <div className="mt-3 rounded-[22px] bg-surface-2 p-4"><ReasonList reasons={r.reasons} /></div>
        {other.score > r.score && <p className="mt-3 text-xs text-muted">{t('c04.otherBetter', { n: pts(other.score) })}</p>}
        <p className="mt-4 text-center text-[10px] text-muted">{t('c04.footer')}</p>
      </div>
    </div>
  );
}
