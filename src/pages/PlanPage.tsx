// C-02 Plan your route (Figma: C-02 Plan your route · EN, node 64:93)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPlaces, planRoutes, searchPlaces } from '../api';
import type { Place } from '../core/types';
import { Icon } from '../components/Icon';
import { TimeWheel } from '../components/TimeWheel';
import { ErrorBox, Skeleton, TopBar, errKey } from '../components/ui';
import { ITB_GATE, fmtTime, useGeolocation } from '../components/geo';
import { useT } from '../i18n';
import { useStore, type Endpoint } from '../state/store';

function nextQuarterHour() {
  const d = new Date(); d.setSeconds(0, 0); d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15);
  return d;
}
type Pick = number | 'me';

type Field = 'from' | 'to';

export default function PlanPage() {
  const { t, lang } = useT(); const nav = useNavigate(); const store = useStore();
  const { pos } = useGeolocation();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [remote, setRemote] = useState<Place[]>([]); // every place returned by search, so picks stay resolvable
  const [from, setFrom] = useState<Pick | null>('me');
  const [to, setTo] = useState<Pick | null>(null);
  const [text, setText] = useState<Record<Field, string>>({ from: '', to: '' });
  const [active, setActive] = useState<Field | null>(null);
  const [suggest, setSuggest] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [dep, setDep] = useState<string>('now');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Custom time from the wheel: today, or tomorrow if that time has already passed.
  const [custom, setCustom] = useState<{ h: number; m: number } | null>(null);
  const customDate = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() < Date.now() - 60e3) d.setDate(d.getDate() + 1); return d; };
  const openCustom = () => { if (custom) return; const d = nextQuarterHour(); setCustom({ h: d.getHours(), m: d.getMinutes() }); setDep('scheduled'); };
  useEffect(() => { listPlaces().then(setPlaces).catch(() => setPlaces([])); }, []);

  const name = (p: Place) => (lang === 'ko' ? p.name_ko : lang === 'id' ? p.name_id : p.name_en ?? p.name_id);
  const all = useMemo(() => [...(places ?? []), ...remote], [places, remote]);
  const ep = (k: Pick): Endpoint => {
    if (k === 'me') return { ...(pos ?? ITB_GATE), label: t('c02.currentLocation') };
    const p = all.find((x) => x.id === k)!; return { lat: p.lat, lng: p.lng, label: p.display_name ?? name(p) };
  };
  const shown = (k: Pick) => (k === 'me' ? t('c02.currentLocation') : all.find((p) => p.id === k) ? name(all.find((p) => p.id === k)!) : '');
  const value = (f: Field) => ((f === 'from' ? from : to) != null ? shown((f === 'from' ? from : to)!) : text[f]);
  const depDate = dep !== 'now' && custom ? customDate(custom.h, custom.m) : new Date();
  const departureIsTomorrow = dep !== 'now' && depDate.toDateString() !== new Date().toDateString();

  // Suggestions while typing: instant local matches, then a debounced remote search (3+ chars).
  const q = active ? text[active].trim() : '';
  const seq = useRef(0);
  useEffect(() => {
    const id = ++seq.current;
    if (!active || q.length < 1) { setSuggest([]); setSearching(false); return; }
    const lc = q.toLowerCase();
    setSuggest((places ?? []).filter((p) => [p.name_en, p.name_id, p.name_ko].some((n) => n?.toLowerCase().includes(lc))));
    if (q.length < 3) { setSearching(false); return; }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const r = await searchPlaces(q);
        if (id !== seq.current) return;
        setRemote((cur) => [...cur, ...r.filter((x) => !cur.some((c) => c.id === x.id))]);
        setSuggest(r);
      } catch { /* keep local matches */ } finally { if (id === seq.current) setSearching(false); }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [q, active, places]);

  const choose = (f: Field, k: Pick) => {
    (f === 'from' ? setFrom : setTo)(k); setText((x) => ({ ...x, [f]: '' })); setActive(null); setSuggest([]); setErr(null);
  };
  const type = (f: Field, v: string) => { (f === 'from' ? setFrom : setTo)(null); setText((x) => ({ ...x, [f]: v })); setActive(f); };
  // Swap works even when "To" is still empty: it just moves the start into the destination.
  const swap = () => { setFrom(to); setTo(from); setText({ from: text.to, to: text.from }); setActive(null); };

  async function compare() {
    if (to == null || from == null) return;
    setBusy(true); setErr(null);
    try {
      const origin = ep(from), destination = ep(to);
      const plan = await planRoutes({ origin, destination, departure_at: depDate, departure_mode: dep === 'now' ? 'now' : 'scheduled', mode: store.prefs.mode });
      store.set({ origin, destination, departure: depDate.toISOString(), plan });
      nav('/routes');
    } catch (e) { setErr(t(errKey(e))); } finally { setBusy(false); }
  }

  const row = (f: Field, label: string, bold: boolean) => (
    <div>
      <label htmlFor={`field-${f}`} className="text-xs text-muted">{label}</label>
      <div className="relative">
        <input id={`field-${f}`} value={value(f)} onChange={(e) => type(f, e.target.value)} onFocus={(e) => { setActive(f); e.currentTarget.select(); }}
          autoComplete="off" placeholder={f === 'to' ? t('c02.searchPlaceholder') : t('c02.from')}
          className={`mt-1 h-9 w-full bg-transparent text-text outline-none placeholder:font-normal placeholder:text-muted ${bold ? 'text-base font-bold' : 'text-[15px] font-medium'}`} />
      </div>
    </div>
  );

  const open = active != null && q.length >= 1;
  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('c02.title')} />
      <div className="flex-1 overflow-y-auto px-6 pb-36">
        <h2 className="page-heading mt-4 text-text">{t('c02.heading')}</h2>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted"><Icon name={store.prefs.mode === 'walk' ? 'walk' : 'wheelchair'} size={15} />{t(store.prefs.mode === 'walk' ? 'c02.subWalk' : 'c02.subWheelchair')}</p>

        <section className="relative mt-6 rounded-[22px] bg-surface-2 py-4 pl-[18px] pr-14">
          {row('from', t('c02.from'), false)}
          <div className="mt-2.5">{row('to', t('c02.to'), true)}</div>
          <button aria-label={t('c02.swap')} onClick={swap}
            className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-text-2"><Icon name="swap" size={20} /></button>
        </section>

        {open && (
          <ul role="listbox" aria-label={t('c02.searchResults')} className="mt-2 overflow-hidden rounded-[18px] border border-line bg-surface">
            {active === 'from' && (
              <li><button role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => choose('from', 'me')} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-text">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-primary"><Icon name="locate" size={16} /></span>{t('c02.currentLocation')}</button></li>
            )}
            {suggest.map((p) => (
              <li key={p.id} className="border-t border-line first:border-t-0">
                <button role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(active!, p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-text-2"><Icon name="pin" size={16} /></span>
                  <span className="min-w-0"><span className="block truncate text-sm font-bold text-text">{name(p)}</span>
                    {p.display_name && <span className="block truncate text-xs text-muted">{p.display_name}</span>}</span>
                </button>
              </li>
            ))}
            {searching && <li className="px-4 py-3 text-xs text-muted">{t('common.loading')}</li>}
            {!searching && suggest.length === 0 && q.length >= 3 && <li className="px-4 py-3 text-xs text-muted">{t('c02.noSearchResults')}</li>}
            <li className="border-t border-line px-4 py-2 text-[10px] text-muted">{t('c02.searchAttribution')}</li>
          </ul>
        )}

        <div className="mt-6 flex items-baseline justify-between">
          <h3 className="text-lg font-bold text-text-3">{t('c02.departure')}</h3><span className="text-xs text-muted">{t('c02.interval')}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button type="button" onClick={() => { setDep('now'); setCustom(null); }} aria-pressed={dep === 'now'}
            className={`h-12 rounded-[14px] text-sm ${dep === 'now' ? 'bg-primary-soft-2 font-bold text-primary' : 'bg-surface-2 font-medium text-muted'}`}>{t('c02.now')}</button>
          <button type="button" onClick={openCustom} aria-pressed={dep !== 'now'} aria-expanded={!!custom}
            className={`flex h-12 items-center justify-center gap-1.5 rounded-[14px] text-sm ${dep !== 'now' ? 'bg-primary-soft-2 font-bold text-primary' : 'bg-surface-2 font-medium text-muted'}`}>
            <Icon name="clock" size={15} />{custom ? fmtTime(depDate, lang) : t('c02.selectTime')}
          </button>
        </div>
        {custom && <div className="mt-3"><TimeWheel hour={custom.h} minute={custom.m} onHour={(h) => setCustom((c) => ({ m: 0, ...c, h }))} onMinute={(m) => setCustom((c) => ({ h: 0, ...c, m }))} labels={{ hour: t('c02.hour'), minute: t('c02.minute') }} /></div>}
        <p className="mt-3.5 text-xs leading-5 text-muted">{t(dep === 'now' ? 'c02.currentBasis' : 'c02.forecastBasis', { time: fmtTime(depDate, lang) })}{departureIsTomorrow && <span className="ml-1 font-medium">{t('c02.nextDay')}</span>}</p>

        <div className="mt-7 flex items-baseline justify-between">
          <h3 className="text-lg font-bold text-text-3">{t('c02.places')}</h3><span className="text-xs text-muted">{t('c02.placeCount', { n: places?.length ?? 0 })}</span>
        </div>
        {!places ? <div className="mt-3 grid grid-cols-2 gap-2.5">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div> : (
          <ul className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-2">
            {places.map((p) => {
              const sel = to === p.id; const isFrom = from === p.id;
              return (
                <li key={p.id}>
                  <button onClick={() => (sel ? setTo(null) : choose('to', p.id))} disabled={isFrom} aria-pressed={sel}
                    className={`flex min-h-10 w-full items-center rounded-xl px-3 py-2 text-left text-xs disabled:opacity-40 ${sel ? 'bg-primary-soft-2 font-bold text-primary' : 'bg-surface-2 font-medium text-text-2'}`}>
                    <span className="line-clamp-2">{name(p)}</span>
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
        <button className="btn-primary w-full" disabled={to == null || from == null || busy} onClick={compare}>
          {busy ? t('common.loading') : t('c02.compare')}
        </button>
      </div>
    </div>
  );
}
