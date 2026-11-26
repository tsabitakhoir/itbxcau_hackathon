// C-02 Plan your route (Figma: C-02 Plan your route · EN, node 64:93)
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPlaces, planRoutes, searchPlaces } from '../api';
import type { Place } from '../core/types';
import { Icon } from '../components/Icon';
import { ErrorBox, Skeleton, TopBar, errKey } from '../components/ui';
import { ITB_GATE, fmtTime, useGeolocation } from '../components/geo';
import { useT } from '../i18n';
import { useStore, type Endpoint } from '../state/store';

function nextQuarterHour() {
  const d = new Date(); d.setSeconds(0, 0); d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15);
  return d;
}
function timeValue(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function timeForDisplay(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date(); date.setHours(hours, minutes, 0, 0);
  return date;
}
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
function upcomingTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date(); date.setHours(hours, minutes, 0, 0);
  if (date <= new Date()) date.setDate(date.getDate() + 1);
  return date;
}
type Pick = number | 'me';

export default function PlanPage() {
  const { t, lang } = useT(); const nav = useNavigate(); const store = useStore();
  const { pos } = useGeolocation();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [from, setFrom] = useState<Pick>('me');
  const [to, setTo] = useState<Pick | null>(null);
  const [dep, setDep] = useState<string>('now');
  const [timeChoice, setTimeChoice] = useState(() => timeValue(nextQuarterHour()));
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Place[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { listPlaces().then(setPlaces).catch(() => setPlaces([])); }, []);

  const name = (p: Place) => (lang === 'ko' ? p.name_ko : lang === 'id' ? p.name_id : p.name_en ?? p.name_id);
  const ep = (k: Pick): Endpoint => {
    if (k === 'me') return { ...(pos ?? ITB_GATE), label: t('c02.currentLocation') };
    const p = [...(places ?? []), ...searchResults].find((x) => x.id === k)!; return { lat: p.lat, lng: p.lng, label: p.display_name ?? name(p) };
  };
  const label = (k: Pick | null) => (k == null ? t('c02.pickDestination') : k === 'me' ? ep(k).label : [...(places ?? []), ...searchResults].some((p) => p.id === k) ? ep(k).label : '…');
  const depDate = dep === 'now' ? new Date() : new Date(dep);
  const departureIsTomorrow = dep !== 'now' && depDate.toDateString() !== new Date().toDateString();

  async function compare() {
    if (to == null || (!places && !searchResults.length)) return;
    setBusy(true); setErr(null);
    try {
      const origin = ep(from), destination = ep(to);
      const plan = await planRoutes({ origin, destination, departure_at: depDate, departure_mode: dep === 'now' ? 'now' : 'scheduled', mode: store.prefs.mode });
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
        <h2 className="page-heading mt-4 text-text">{t('c02.heading')}</h2>
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
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => setDep('now')} aria-pressed={dep === 'now'}
            className={`h-12 rounded-[14px] text-sm ${dep === 'now' ? 'bg-primary-soft-2 font-bold text-primary' : 'bg-surface-2 font-medium text-muted'}`}>{t('c02.now')}</button>
          <label className="block min-w-0">
            <span className="sr-only">{t('c02.departure')}</span>
            <select aria-label={t('c02.departure')} value={dep === 'now' ? '' : timeChoice}
              onChange={(e) => { const value = e.target.value; if (!value) return; setTimeChoice(value); setDep(upcomingTime(value).toISOString()); }}
              className={`h-12 w-full min-w-0 rounded-[14px] border-0 px-3 text-center text-sm font-semibold outline-none focus:ring-2 focus:ring-primary ${dep !== 'now' ? 'bg-primary-soft-2 text-primary' : 'bg-surface-2 text-text'}`}>
              <option value="" disabled>{t('c02.selectTime')}</option>
              {TIME_OPTIONS.map((value) => <option key={value} value={value}>{fmtTime(timeForDisplay(value), lang)}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-3.5 text-xs leading-5 text-muted">{t(dep === 'now' ? 'c02.currentBasis' : 'c02.forecastBasis', { time: fmtTime(depDate, lang) })}{departureIsTomorrow && <span className="ml-1 font-medium">{t('c02.nextDay')}</span>}</p>

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
