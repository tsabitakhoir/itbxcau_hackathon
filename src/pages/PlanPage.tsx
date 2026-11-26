// C-02 Plan your route (Figma: C-02 Plan your route · EN, node 64:93)
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPlaces, planRoutes, searchPlaces } from '../api';
import type { Place } from '../core/types';
import { Icon } from '../components/Icon';
import { TimeWheel } from '../components/TimeWheel';
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
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Place[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const slots = useMemo(() => nextSlots(2), []);
  // Custom time from the wheel: today, or tomorrow if that time has already passed.
  const [custom, setCustom] = useState<{ h: number; m: number } | null>(null);
  const customDate = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() < Date.now() - 60e3) d.setDate(d.getDate() + 1); return d; };
  const openCustom = () => { if (custom) return; const d = dep === 'now' ? new Date() : new Date(dep); setCustom({ h: d.getHours(), m: d.getMinutes() }); };
  useEffect(() => { listPlaces().then(setPlaces).catch(() => setPlaces([])); }, []);

  const name = (p: Place) => (lang === 'ko' ? p.name_ko : lang === 'id' ? p.name_id : p.name_en ?? p.name_id);
  const ep = (k: Pick): Endpoint => {
    if (k === 'me') return { ...(pos ?? ITB_GATE), label: t('c02.currentLocation') };
    const p = [...(places ?? []), ...searchResults].find((x) => x.id === k)!; return { lat: p.lat, lng: p.lng, label: p.display_name ?? name(p) };
  };
  const label = (k: Pick | null) => (k == null ? t('c02.pickDestination') : k === 'me' ? ep(k).label : [...(places ?? []), ...searchResults].some((p) => p.id === k) ? ep(k).label : '…');
  const depDate = custom ? customDate(custom.h, custom.m) : dep === 'now' ? new Date() : new Date(dep);

  async function compare() {
    if (to == null || (!places && !searchResults.length)) return;
    setBusy(true); setErr(null);
    try {
      const origin = ep(from), destination = ep(to);
      const plan = await planRoutes({ origin, destination, departure_at: depDate, mode: store.prefs.mode });
      store.set({ origin, destination, departure: depDate.toISOString(), plan });
      nav('/routes');
    } catch (e) { setErr(t(errKey(e))); } finally { setBusy(false); }
  }
  async function findDestination(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (query.trim().length < 3) return;
    setSearching(true); setSearched(true); setSearchResults([]); setTo(null); setErr(null);
    try { setSearchResults(await searchPlaces(query)); }
    catch (error) { setErr(t(errKey(error))); }
    finally { setSearching(false); }
  }
  // Tapping a place fills the destination; tapping it again (or the selected one) clears it.
  const pick = (id: number) => setTo((cur) => (cur === id ? null : id));

  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('c02.title')} />
      <div className="flex-1 overflow-y-auto px-6 pb-36">
        <h2 className="mt-4 text-[26px] font-bold leading-[39px] text-text">{t('c02.heading')}</h2>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted"><Icon name={store.prefs.mode === 'walk' ? 'walk' : 'wheelchair'} size={15} />{t(store.prefs.mode === 'walk' ? 'c02.subWalk' : 'c02.subWheelchair')}</p>

        <section className="relative mt-6 rounded-[22px] bg-surface-2 py-4 pl-[18px] pr-14">
          <p className="text-xs text-muted">{t('c02.from')}</p>
          <p className="mt-1 truncate text-[15px] font-medium text-text-3">{label(from)}</p>
          <p className="mt-3.5 text-xs text-muted">{t('c02.to')}</p>
          <p className={`mt-1 truncate text-base font-bold ${to == null ? 'text-muted' : 'text-text'}`}>{label(to)}</p>
          <button aria-label={t('c02.swap')} disabled={to == null} onClick={() => { if (to != null) { setFrom(to); setTo(from); } }}
            className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-text-2 disabled:opacity-40"><Icon name="swap" size={20} /></button>
        </section>

        <form onSubmit={findDestination} className="mt-5">
          <label htmlFor="destination-search" className="sr-only">{t('c02.searchHeading')}</label>
          <div className="flex gap-2">
            <input id="destination-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('c02.searchPlaceholder')} minLength={3} required
              className="h-12 min-w-0 flex-1 rounded-[14px] bg-surface-2 px-4 text-sm text-text outline-none placeholder:text-muted focus:ring-2 focus:ring-primary" />
            <button type="submit" disabled={searching || query.trim().length < 3} className="h-12 rounded-[14px] bg-primary-soft-2 px-4 text-sm font-bold text-primary disabled:opacity-50">
              {searching ? t('common.loading') : t('c02.searchButton')}
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted">{t('c02.searchAttribution')}</p>
        </form>

        <div className="mt-6 flex items-baseline justify-between">
          <h3 className="text-lg font-bold text-text-3">{t('c02.departure')}</h3><span className="text-xs text-muted">{t('c02.interval')}</span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2.5">
          {[{ v: 'now', l: t('c02.now') }, ...slots.map((s) => ({ v: s.toISOString(), l: fmtTime(s, lang) }))].map((o) => (
            <button key={o.v} onClick={() => { setDep(o.v); setCustom(null); }} aria-pressed={dep === o.v && !custom}
              className={`h-11 rounded-[14px] text-sm ${dep === o.v && !custom ? 'bg-primary-soft-2 font-bold text-primary' : 'bg-surface-2 font-medium text-muted'}`}>{o.l}</button>
          ))}
          <button onClick={openCustom} aria-pressed={!!custom} aria-expanded={!!custom}
            className={`flex h-11 items-center justify-center gap-1 rounded-[14px] text-sm ${custom ? 'bg-primary-soft-2 font-bold text-primary' : 'bg-surface-2 font-medium text-muted'}`}>
            <Icon name="clock" size={15} />{custom ? `${String(custom.h).padStart(2, '0')}:${String(custom.m).padStart(2, '0')}` : t('c02.custom')}
          </button>
        </div>
        {custom && <div className="mt-3"><TimeWheel hour={custom.h} minute={custom.m} onHour={(h) => setCustom((c) => ({ m: 0, ...c, h }))} onMinute={(m) => setCustom((c) => ({ h: 0, ...c, m }))} labels={{ hour: t('c02.hour'), minute: t('c02.minute') }} /></div>}
        <p className="mt-3.5 text-xs text-muted">{t(depDate.toDateString() === new Date().toDateString() ? 'c02.scoreBasis' : 'c02.scoreBasisTomorrow', { time: fmtTime(depDate, lang) })}</p>

        <div className="mt-7 flex items-baseline justify-between">
          <h3 className="text-lg font-bold text-text-3">{t(searched ? 'c02.searchResults' : 'c02.places')}</h3><span className="text-xs text-muted">{t('c02.placeCount', { n: searched ? searchResults.length : places?.length ?? 0 })}</span>
        </div>
        {!places && !searched ? <div className="mt-3 grid grid-cols-2 gap-2.5">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div> : (
          <ul className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-2">
            {(searched ? searchResults : places ?? []).map((p) => {
              const sel = to === p.id; const isFrom = from === p.id;
              return (
                <li key={p.id}>
                  <button onClick={() => pick(p.id)} disabled={isFrom} aria-pressed={sel}
                    className={`flex min-h-10 w-full items-center rounded-xl px-3 py-2 text-left text-xs disabled:opacity-40 ${sel ? 'bg-primary-soft-2 font-bold text-primary' : 'bg-surface-2 font-medium text-text-2'}`}>
                    <span className="line-clamp-2">{name(p)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {searched && !searching && searchResults.length === 0 && !err && <p className="mt-3 text-xs text-muted">{t('c02.noSearchResults')}</p>}
        <p className="mt-6 text-[11px] text-muted">{t('c02.demoNote')}</p>
        {err && <div className="mt-3"><ErrorBox message={err} /></div>}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-6 pb-[max(2.25rem,env(safe-area-inset-bottom))] pt-6">
        <button className="btn-primary w-full" disabled={to == null || busy} onClick={compare}>
          {busy ? t('common.loading') : t('c02.compare')}
        </button>
      </div>
    </div>
  );
}
