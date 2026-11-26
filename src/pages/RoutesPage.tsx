// C-03 Compare routes (Figma: C-03 Compare routes · EN, node 64:141)
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { startTrip } from '../api';
import type { RouteKind, RouteOption } from '../core/types';
import { Icon } from '../components/Icon';
import { FitBounds, MapView } from '../components/MapView';
import { RouteLines } from '../components/RouteLines';
import { ErrorBox, SimChip, TopBar, errKey, km, minutes, pts } from '../components/ui';
import { fmtTime } from '../components/geo';
import { useT } from '../i18n';
import { useStore } from '../state/store';

export default function RoutesPage() {
  const { t, lang } = useT(); const nav = useNavigate(); const { plan, origin, destination, departure, prefs } = useStore();
  const [sel, setSel] = useState<RouteKind>('safest');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  if (!plan || !origin || !destination) return <Navigate to="/plan" replace />;
  const { fastest: f, safest: s } = plan;
  const wheelchair = (plan.mode ?? prefs.mode) === 'wheelchair';

  async function start() {
    setBusy(true); setErr(null);
    try { const trip = await startTrip({ origin: origin!, destination: destination!, plan: plan!, chosen: sel }); nav(`/walk/${trip.id}`); }
    catch (e) { setErr(t(errKey(e))); setBusy(false); }
  }
  const accessLine = (r: RouteOption) => !r.access ? null
    : r.access.steps > 0 ? <span className="text-danger-text">{t('c03.hasSteps', { n: r.access.steps })}</span>
    : <span className="text-safe">{t('c03.stepFree')}</span>;
  const Card = ({ k, r }: { k: RouteKind; r: RouteOption }) => {
    const active = sel === k; const safe = k === 'safest';
    return (
      <button onClick={() => setSel(k)} aria-pressed={active}
        className={`relative rounded-route-card px-[18px] pb-4 pt-[15px] text-left transition ${safe ? 'bg-primary-soft' : 'bg-surface-2'} ${active ? 'ring-2 ring-primary' : ''}`}>
        <p className={`text-[13px] font-medium ${safe ? 'text-primary' : 'text-muted'}`}>{t(`kind.${k}`)}</p>
        <p className="mt-1.5 text-[28px] font-bold leading-[42px] text-text">{t('common.min', { n: minutes(r) })}</p>
        <p className="mt-1 text-sm text-muted">{km(r.length_m)}</p>
        <p className={`mt-1.5 text-[13px] font-medium ${safe ? 'text-primary' : 'text-text-2'}`}>{t('c03.score', { n: `${pts(r.score)}` })}</p>
        {wheelchair && <p className="mt-1 text-[11px] font-medium">{accessLine(r)}</p>}
      </button>
    );
  };
  const headline = plan.same_route ? t('c03.sameRoute') : plan.extra_minutes > 0 ? t('c03.headline', { n: plan.extra_minutes }) : t('c03.headlineNoExtra');

  return (
    <div className="relative flex h-full flex-col bg-surface">
      <div className="z-[600] bg-surface">
        <TopBar title={t('c03.title')} right={plan.simulated ? <SimChip className="mr-3" /> : undefined} />
        <div className="mx-6 mb-2.5 flex h-11 items-center justify-between rounded-[14px] bg-surface px-3.5 text-xs">
          <span className="truncate font-medium text-text">{origin.label}  →  {destination.label}</span>
          <span className="ml-2 shrink-0 text-muted">{fmtTime(departure ?? new Date(), lang)}</span>
        </div>
      </div>
      <div className="relative h-[280px] shrink-0">
        <MapView>
          <RouteLines plan={plan} selected={sel} onSelect={setSel} labels />
          <FitBounds points={[...f.geometry, ...s.geometry]} />
        </MapView>
      </div>
      <div className="sheet relative z-[600] -mt-3 flex-1 overflow-y-auto px-6 pb-36 pt-3">
        <div className="sheet-handle" />
        <h2 className="mt-6 text-2xl font-bold leading-9 text-text">{headline}</h2>
        {wheelchair && <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary"><Icon name="wheelchair" size={15} />{t('c03.wheelchairOn')}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Card k="fastest" r={f} />
          <Card k="safest" r={s} />
        </div>
        <button onClick={() => nav(`/routes/${sel}`)} className="mt-[22px] flex h-[60px] w-full items-center justify-between rounded-[18px] bg-surface-2 px-4 text-left">
          <span className="text-[15px] font-medium text-text-3">{t('c03.why')}</span>
          <span className="text-xs font-medium text-primary">{t('c03.details')}  ›</span>
        </button>
        {(f.data_limited || s.data_limited) && <p className="mt-3 text-[11px] text-muted">{t('c03.dataLimited')}</p>}
        <p className="mt-4 text-center text-[10px] text-muted">{t('common.disclaimer')}</p>
        {err && <div className="mt-3"><ErrorBox message={err} /></div>}
      </div>
      <div className="absolute inset-x-0 bottom-0 z-[700] bg-surface px-6 pb-[max(2.1rem,env(safe-area-inset-bottom))] pt-3">
        <button className="btn-primary w-full" disabled={busy} onClick={start}>
          {busy ? t('common.loading') : t(sel === 'safest' ? 'c03.start' : 'c03.startFast')}
        </button>
      </div>
    </div>
  );
}
