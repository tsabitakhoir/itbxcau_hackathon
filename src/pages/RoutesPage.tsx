// C-03 Compare routes (Figma: EN · C-03 Compare routes)
import { useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { startTrip } from '../api';
import type { RouteKind, RouteOption } from '../core/types';
import { Icon } from '../components/Icon';
import { FitBounds, MapView } from '../components/MapView';
import { RouteLines } from '../components/RouteLines';
import { ErrorBox, SimChip, TopBar, errKey, km, minutes, pts, scoreTone, toneText } from '../components/ui';
import { fmtTime } from '../components/geo';
import { useT } from '../i18n';
import { useStore } from '../state/store';

const litPct = (r: RouteOption) => r.reasons.find((x) => x.code === 'LIT_PCT')?.pct ?? Math.round(r.factors.lighting * 100);
const openCount = (r: RouteOption) => r.reasons.find((x) => x.code === 'OPEN_PLACES')?.count ?? 0;

export default function RoutesPage() {
  const { t, lang } = useT(); const nav = useNavigate(); const { plan, origin, destination, departure } = useStore();
  const [sel, setSel] = useState<RouteKind>('safest');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  if (!plan || !origin || !destination) return <Navigate to="/plan" replace />;
  const { fastest: f, safest: s } = plan;

  async function start() {
    setBusy(true); setErr(null);
    try { const trip = await startTrip({ origin: origin!, destination: destination!, plan: plan!, chosen: sel }); nav(`/walk/${trip.id}`); }
    catch (e) { setErr(t(errKey(e))); setBusy(false); }
  }
  const cond = (r: RouteOption) => { const tone = scoreTone(r.score); return <span className={toneText[tone]}>{t(`band.${tone}`)}</span>; };
  const Row = ({ a, label, b }: { a: ReactNode; label: string; b: ReactNode }) => (
    <div className="grid grid-cols-[100px_1fr_100px] items-center text-center"><span className="text-[13px] font-bold">{a}</span><span className="text-xs text-muted">{label}</span><span className="text-[13px] font-bold text-safe">{b}</span></div>
  );
  const Card = ({ k, r }: { k: RouteKind; r: RouteOption }) => {
    const active = sel === k; const safe = k === 'safest';
    return (
      <button onClick={() => setSel(k)} aria-pressed={active}
        className={`relative h-[140px] rounded-route-card p-3.5 text-left transition ${safe ? 'bg-safe-soft' : 'bg-surface-3'} ${active ? `ring-2 ${safe ? 'ring-safe-line' : 'ring-caution-line'}` : ''}`}>
        <p className={`text-[13px] font-bold ${safe ? 'text-safe' : 'text-caution'}`}>{t(`kind.${k}`)}{r.data_limited && <span className="ml-1 text-[10px] font-medium text-muted">· {t('c03.dataLimited')}</span>}</p>
        <p className="mt-1.5 flex items-baseline gap-2"><span className={`text-4xl font-bold leading-[1.1] ${safe ? 'text-safe' : 'text-caution'}`}>{r.data_limited ? '~' : ''}{pts(r.score)}</span><span className="text-xs text-muted">{t('common.pts')}</span></p>
        <p className="mt-1 text-sm font-bold">{t('common.min', { n: minutes(r) })} · {km(r.length_m)}</p>
        <p className={`mt-1 text-[10px] ${safe ? 'text-safe' : 'text-muted'}`}>
          {safe ? t('c03.safeDelta', { n: plan.extra_minutes, d: pts(s.score) - pts(f.score) }) : t('c03.earliest')}
        </p>
      </button>
    );
  };

  return (
    <div className="relative flex h-full flex-col bg-surface">
      <div className="z-[600] bg-surface">
        <TopBar title={t('c03.title')} right={<SimChip className="mr-3" />} />
        <div className="mx-6 mb-2.5 flex h-11 items-center justify-between rounded-card bg-surface px-3.5 text-xs">
          <span className="truncate font-medium">{origin.label}  →  {destination.label}</span>
          <span className="ml-2 shrink-0 text-muted">{fmtTime(departure ?? new Date(), lang)}</span>
        </div>
      </div>
      <div className="relative h-[260px] shrink-0">
        <MapView>
          <RouteLines plan={plan} selected={sel} onSelect={setSel} labels />
          <FitBounds points={[...f.geometry, ...s.geometry]} />
        </MapView>
      </div>
      <div className="sheet relative z-[600] -mt-3 flex-1 overflow-y-auto px-6 pb-40 pt-3">
        <div className="sheet-handle" />
        <h2 className="mt-4 text-[23px] font-bold leading-tight">
          {plan.same_route ? t('c03.sameRoute') : plan.extra_minutes > 0 ? t('c03.headline', { n: plan.extra_minutes }) : t('c03.headlineNoExtra')}
        </h2>
        <div className={`mt-4 grid gap-3 ${plan.same_route ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!plan.same_route && <Card k="fastest" r={f} />}
          <Card k="safest" r={s} />
        </div>
        {!plan.same_route && (
          <div className="mt-6 space-y-4">
            <Row a={`${litPct(f)}%`} label={t('c03.rowLit')} b={`${litPct(s)}%`} />
            <Row a={openCount(f)} label={t('c03.rowOpen')} b={openCount(s)} />
            <Row a={cond(f)} label={t('c03.rowNight')} b={cond(s)} />
          </div>
        )}
        <p className="mt-5 text-center text-[10px] text-muted">{t('common.disclaimer')}</p>
        {err && <div className="mt-3"><ErrorBox message={err} /></div>}
      </div>
      <div className="absolute inset-x-0 bottom-0 z-[700] bg-surface px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button className="btn-primary relative w-full" disabled={busy} onClick={start}>
          {busy ? t('common.loading') : t(sel === 'safest' ? 'c03.walkSafe' : 'c03.walkFast')}<Icon name="arrow" size={22} className="absolute right-[18px]" />
        </button>
        <button onClick={() => nav(`/routes/${sel}`)} className="mt-1 flex min-h-9 w-full items-center justify-center text-[11px] font-medium text-safe">{t('c03.details')}  ›</button>
      </div>
    </div>
  );
}
