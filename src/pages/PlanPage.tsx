// C-02 Plan route (Figma: EN · C-02 Plan route)
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPlaces, planRoutes } from '../api';
import type { Place } from '../core/types';
import { Icon } from '../components/Icon';
import { ErrorBox, Skeleton, TopBar, errKey } from '../components/ui';
import { ITB_GATE, fmtTime, useGeolocation } from '../components/geo';
import { useT } from '../i18n';
import { useStore, type Endpoint } from '../state/store';

function nextSlots(n = 3) {
  const out: Date[] = []; const d = new Date(); d.setSeconds(0, 0); d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15);
  for (let i = 0; i < n; i++) out.push(new Date(d.getTime() + i * 15 * 60e3));
  return out;
}
type Pick = number | 'me';

export default function PlanPage() {
  const { t, lang } = useT(); const nav = useNavigate(); const store = useStore();
  const { pos } = useGeolocation();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [from, setFrom] = useState<Pick>('me');
  const [to, setTo] = useState<Pick | null>(null);
  const [dep, setDep] = useState<string>('now');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const slots = useMemo(() => nextSlots(), []);
  useEffect(() => { listPlaces().then(setPlaces).catch(() => setPlaces([])); }, []);

  const name = (p: Place) => (lang === 'ko' ? p.name_ko : lang === 'id' ? p.name_id : p.name_en ?? p.name_id);
  const ep = (k: Pick): Endpoint => {
    if (k === 'me') return { ...(pos ?? ITB_GATE), label: t('c02.currentLocation') };
    const p = places!.find((x) => x.id === k)!; return { lat: p.lat, lng: p.lng, label: name(p) };
  };
  const label = (k: Pick | null) => (k == null ? t('c02.pickDestination') : places ? ep(k).label : '…');
  const depDate = dep === 'now' ? new Date() : new Date(dep);

  async function compare() {
    if (!places || to == null) return;
    setBusy(true); setErr(null);
    try {
      const origin = ep(from), destination = ep(to);
      const plan = await planRoutes({ origin, destination, departure_at: depDate });
      store.set({ origin, destination, departure: depDate.toISOString(), plan });
      nav('/routes');
    } catch (e) { setErr(t(errKey(e))); } finally { setBusy(false); }
  }
  // Tapping a place fills the destination; tapping it again (or the selected one) clears it.
  const pick = (id: number) => setTo((cur) => (cur === id ? null : id));

  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('c02.title')} />
      <div className="flex-1 overflow-y-auto px-6 pb-36">
        <h2 className="mt-3 text-2xl font-bold">{t('c02.heading')}</h2>
        <p className="mt-1 text-[13px] text-muted">{t('c02.sub')}</p>

        <section className="relative mt-6 rounded-card bg-surface py-3 pl-11 pr-14">
          <span className="absolute left-[18px] top-[22px] h-3 w-3 rounded-full bg-safe-line" />
          <span className="absolute left-[23px] top-[38px] h-[35px] w-0.5 bg-line" />
          <Icon name="pin" size={22} className="absolute left-[13px] top-[76px] text-safe-line" />
          <p className="text-[11px] text-muted">{t('c02.from')}</p>
          <p className="truncate text-sm font-medium">{label(from)}</p>
          <p className="mt-4 text-[11px] text-muted">{t('c02.to')}</p>
          <p className={`truncate text-[15px] font-bold ${to == null ? 'text-muted' : ''}`}>{label(to)}</p>
          <button aria-label={t('c02.swap')} disabled={to == null} onClick={() => { if (to != null) { setFrom(to); setTo(from); } }}
            className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center disabled:opacity-40"><Icon name="swap" /></button>
        </section>

        <div className="mt-6 flex items-baseline justify-between">
          <h3 className="text-base font-bold">{t('c02.departure')}</h3><span className="text-[11px] text-muted">{t('c02.interval')}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {[{ v: 'now', l: t('c02.now') }, ...slots.map((s) => ({ v: s.toISOString(), l: fmtTime(s, lang) }))].map((o) => (
            <button key={o.v} onClick={() => setDep(o.v)} aria-pressed={dep === o.v}
              className={`h-[43px] rounded-xl text-[13px] ${dep === o.v ? 'bg-primary font-bold text-on-primary' : 'bg-surface font-medium text-muted'}`}>{o.l}</button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">{t('c02.scoreBasis', { time: fmtTime(depDate, lang) })}</p>

        <div className="mt-8 flex items-baseline justify-between">
          <h3 className="text-base font-bold">{t('c02.places')}</h3><span className="text-xs text-muted">{t('c02.placeCount', { n: places?.length ?? 0 })}</span>
        </div>
        {!places ? <div className="mt-3 grid grid-cols-2 gap-2.5">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div> : (
          <ul className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-[9px]">
            {places.map((p) => {
              const sel = to === p.id; const isFrom = from === p.id;
              return (
                <li key={p.id}>
                  <button onClick={() => pick(p.id)} disabled={isFrom} aria-pressed={sel}
                    className={`flex h-12 w-full items-center gap-1.5 rounded-card px-3.5 text-left text-xs disabled:opacity-40 ${sel ? 'bg-primary-soft-2 font-bold text-primary-strong' : 'bg-surface-2 font-medium text-muted'}`}>
                    {sel && <Icon name="check" size={18} className="shrink-0 text-safe-line" />}<span className="line-clamp-2">{name(p)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-6 text-[11px] text-muted">{t('c02.demoNote')}</p>
        {err && <div className="mt-3"><ErrorBox message={err} /></div>}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-6 pb-[max(2.25rem,env(safe-area-inset-bottom))] pt-6">
        <button className="btn-primary relative w-full" disabled={to == null || busy} onClick={compare}>
          {busy ? t('common.loading') : t('c02.compare')}<Icon name="arrow" size={22} className="absolute right-[18px]" />
        </button>
      </div>
    </div>
  );
}
