// C-05 Navigation (Figma: C-05 Navigation · EN, node 64:438). Voice guidance reads each next turn aloud when enabled.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { finishTrip, getTrip, listContacts, pushLocation } from '../api';
import { LOCATION_PUSH_SEC } from '../core/config';
import type { EmergencyContact, LatLng, Maneuver, NavStep, Trip } from '../core/types';
import { Icon } from '../components/Icon';
import { FitBounds, FollowPos, MapView, token } from '../components/MapView';
import { ErrorBox, SimChip, Toast, TopBar, errKey } from '../components/ui';
import { fmtTime, useGeolocation } from '../components/geo';
import { speak, stopSpeaking } from '../components/voice';
import { useStore } from '../state/store';
import { Sheet } from '../components/Sheet';
import { useT } from '../i18n';
import { Marker, Polyline, Tooltip } from 'react-leaflet';
import { meIcon } from '../components/ReportMarkers';

/** Point at fraction f (0..1) along a polyline, by vertex count (good enough for the demo simulation). */
function along(g: [number, number][], f: number): LatLng {
  const x = Math.min(0.999, f) * (g.length - 1); const i = Math.floor(x); const r = x - i;
  return { lat: g[i][0] + (g[i + 1][0] - g[i][0]) * r, lng: g[i][1] + (g[i + 1][1] - g[i][1]) * r };
}

const distM = (a: [number, number], b: [number, number]) => { const r = Math.PI / 180; return 6371000 * Math.hypot((b[1] - a[1]) * r * Math.cos((a[0] + b[0]) * r / 2), (b[0] - a[0]) * r); };
const nearestIdx = (g: [number, number][], p: [number, number]) => g.reduce((best, q, i) => (distM(q, p) < distM(g[best], p) ? i : best), 0);
const turnIcon = (m: Maneuver) => (m.includes('right') ? 'right' : m.includes('left') ? 'left' : m === 'arrive' ? 'pin' : 'up');

export default function WalkPage() {
  const { tripId = '' } = useParams(); const { t, lang } = useT(); const nav = useNavigate(); const { prefs } = useStore();
  const spoken = useRef<string>('');
  const [trip, setTrip] = useState<Trip | null>(null); const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { pos: gps, status } = useGeolocation();
  const [simF, setSimF] = useState(0);
  const queue = useRef<(LatLng & { at: number })[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [follow, setFollow] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [card, setCard] = useState(0); const strip = useRef<HTMLDivElement>(null);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  useEffect(() => { listContacts().then(setContacts).catch(() => undefined); }, []);

  useEffect(() => { getTrip(tripId).then(setTrip).catch((e) => setErr(t(errKey(e)))); }, [tripId, t]);
  // If there is no real GPS fix near the route (e.g. desktop demo), simulate walking along the route.
  const simulate = status !== 'ok';
  const pos: LatLng | null = trip ? (simulate ? along(trip.route.geometry, simF) : gps) : null;

  // push location every LOCATION_PUSH_SEC; queue while offline and flush later
  useEffect(() => {
    if (!trip) return;
    const id = setInterval(async () => {
      setNow(Date.now());
      if (simulate) setSimF((f) => Math.min(1, f + LOCATION_PUSH_SEC / Math.max(60, trip.route.duration_s)));
      if (pos) queue.current.push({ ...pos, at: Date.now() });
      while (queue.current.length) {
        const p = queue.current[0];
        try { await pushLocation(trip.id, { lat: p.lat, lng: p.lng }); queue.current.shift(); } catch { break; }
      }
    }, LOCATION_PUSH_SEC * 1000);
    return () => clearInterval(id);
  }, [trip, pos, simulate]);

  // keep screen on
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav2 = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav2.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    return () => { lock?.release().catch(() => undefined); };
  }, []);

  async function share() {
    if (!trip) return;
    const text = `${t('c07.title', { name: '' }).trim()} → ${trip.destination.label}`;
    try {
      if (navigator.share) await navigator.share({ text, url: trip.share_url });
      else { await navigator.clipboard.writeText(trip.share_url); setToast(t('c05.copied')); setTimeout(() => setToast(null), 2000); }
    } catch { /* user cancelled */ }
  }
  async function end(status: 'arrived' | 'cancelled') {
    if (!trip) return; await finishTrip(trip.id, status);
    nav(status === 'arrived' ? `/arrived/${trip.id}` : '/map', { replace: true });
  }

  // Instruction cards: the next turn first, then the turns after it (swipe sideways to preview).
  const g0 = trip?.route.geometry ?? [];
  const stepsIdx = (trip?.route.steps ?? []).map((st) => ({ st, i: nearestIdx(g0, st.at) }));
  const doneIdx = trip && simulate ? Math.min(0.999, simF) * (g0.length - 1) : pos && g0.length ? nearestIdx(g0, [pos.lat, pos.lng]) : 0;
  const upcoming: NavStep[] = stepsIdx.filter((x) => x.st.maneuver !== 'depart' && x.i > doneIdx).map((x) => x.st);
  const subFor = (st?: NavStep) => `${st?.name ? `${st.name} · ` : ''}${t(trip?.chosen === 'safest' ? (trip.route.mode === 'wheelchair' ? 'c05.nextWheelchair' : 'c05.nextSafe') : 'c05.nextFast')}`;
  const cards = !trip ? [] : upcoming.length
    ? upcoming.map((st) => { const d = pos ? Math.round(distM([pos.lat, pos.lng], st.at) / 10) * 10 : null; return { key: `${st.maneuver}@${st.at.join(',')}`, step: st, title: d == null ? t(`turn.${st.maneuver}`, { m: '' }) : st.maneuver === 'arrive' ? t('c05.arriveIn', { m: d }) : t(`turn.${st.maneuver}`, { m: d }), sub: subFor(st) }; })
    : [{ key: 'dest', step: undefined as NavStep | undefined, title: t('c05.nextTitle', { place: trip.destination.label }), sub: subFor(undefined) }];
  const nextTitle = cards[0]?.title ?? ''; const nextSub = cards[0]?.sub ?? '';
  const stepKey = cards[0]?.key ?? 'dest';
  // When the route moves on to the next turn, bring the strip back to the first card.
  useEffect(() => { setCard(0); strip.current?.scrollTo({ left: 0 }); }, [stepKey]);
  const onStrip = () => { const el = strip.current; if (el && el.clientWidth) setCard(Math.round(el.scrollLeft / el.clientWidth)); };
  const dots = cards.slice(0, 6);

  // Voice guidance: speak when the instruction changes (not every distance tick).
  useEffect(() => {
    if (!prefs.voice || !trip || spoken.current === stepKey) return;
    spoken.current = stepKey; speak(`${nextTitle}. ${nextSub}`, lang);
  }, [prefs.voice, stepKey, trip]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSpeaking(), []);

  if (err) return <div className="p-6"><ErrorBox message={err} onRetry={() => nav('/map')} /></div>;
  if (!trip) return <div className="grid h-full place-items-center text-muted">{t('common.loading')}</div>;
  const remaining = Math.max(0, Math.round((new Date(trip.eta).getTime() - now) / 60e3));
  const g = trip.route.geometry;
  const done = simulate ? Math.min(0.999, simF) * (g.length - 1) : 0;
  const passed: [number, number][] = simulate && pos ? [...g.slice(0, Math.floor(done) + 1), [pos.lat, pos.lng]] : [];
  const leftM = Math.round(trip.route.length_m * (1 - (simulate ? simF : 0)) / 10) * 10;
  const contact = contacts[0]?.name;

  return (
    <div className="relative flex h-full flex-col bg-surface">
      <TopBar title={t('c05.title')} right={<SimChip className="mr-3" />} />
      <div className="relative flex-1">
        <div className="absolute inset-0">
          <MapView>
            {passed.length > 1 && <Polyline positions={passed} pathOptions={{ color: token('--color-route-fast', 0.8), weight: 6 }} />}
            <Polyline positions={g} pathOptions={{ color: '#fff', weight: 11 }} />
            <Polyline positions={g} pathOptions={{ color: token(trip.chosen === 'safest' ? '--color-route-safe' : '--color-route-fast'), weight: 6 }} />
            <FitBounds points={g} top={170} bottom={collapsed ? 110 : 360} />
            {pos && <Marker position={[pos.lat, pos.lng]} icon={meIcon}><Tooltip permanent direction="right" offset={[22, 0]} className="route-label">{t('c05.you')}</Tooltip></Marker>}
            <FollowPos pos={follow ? pos : null} />
          </MapView>
        </div>
        <div className="absolute inset-x-6 top-2 z-[500] space-y-3">
          <div>
            <div ref={strip} onScroll={onStrip} aria-live="polite" role="group" aria-roledescription="carousel" aria-label={t('c05.title')}
              className="flex snap-x snap-mandatory overflow-x-auto rounded-[18px] shadow-float [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {cards.map((c, i) => (
                <div key={c.key} role="group" aria-label={`${i + 1} / ${cards.length}`} className="flex min-h-[90px] w-full shrink-0 snap-center items-center gap-5 bg-surface px-5 py-3">
                  <Icon name={c.step ? turnIcon(c.step.maneuver) : 'right'} size={32} className="shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-lg font-bold leading-6 text-text">{c.title}</p>
                    <p className="mt-1 truncate text-[11px] text-text-2">{c.sub}</p>
                  </div>
                  {prefs.voice && i === card && <button aria-label={t('c01.voice')} onClick={() => speak(`${c.title}. ${c.sub}`, lang)} className="ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"><Icon name="volume" size={20} /></button>}
                </div>
              ))}
            </div>
            {dots.length > 1 && (
              <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
                {dots.map((c, i) => <span key={c.key} className={`h-1.5 rounded-full transition-all ${i === card ? 'w-4 bg-primary' : 'w-1.5 bg-white/80 shadow'}`} />)}
              </div>
            )}
          </div>
          <button onClick={share} className="flex h-[42px] w-full items-center justify-between rounded-[14px] bg-surface-2/95 px-3.5 text-xs font-medium text-text-2">
            <span className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-safe-line" />{contact ? t('c05.sharingWith', { name: contact }) : t('c05.sharing')}</span>
            <Icon name="share" size={17} className="text-safe-line" />
          </button>
        </div>
        <Sheet peek={92} onCollapsedChange={setCollapsed}
          above={<div className="flex items-end justify-end gap-3 px-6 pb-4">
            {collapsed && <button aria-label="SOS" onClick={() => nav(`/sos?trip=${trip.id}`)} className="grid h-14 w-14 place-items-center rounded-full bg-danger text-sm font-bold text-on-primary shadow-float">SOS</button>}
            <button onClick={() => setFollow((v) => !v)} aria-pressed={follow} aria-label={t('c01.myLocation')} className={`grid h-12 w-12 place-items-center rounded-full shadow-float ${follow ? 'bg-primary text-on-primary' : 'bg-surface'}`}><Icon name="locate" /></button>
          </div>}>
          <div className="px-6 pb-[max(2.1rem,env(safe-area-inset-bottom))]">
            <div className="mt-2 flex items-baseline gap-5"><p className="text-[32px] font-bold leading-none text-text">{t('common.min', { n: remaining })}</p><p className="text-sm text-muted">{t('c05.left', { m: leftM })}</p></div>
            <p className="mt-4 text-base font-medium text-text">{t('c05.eta', { time: fmtTime(trip.eta, lang) })}</p>
            <button onClick={() => nav(`/sos?trip=${trip.id}`)} className="mt-5 flex h-14 w-full items-center gap-4 rounded-[16px] bg-danger-soft px-4 text-left active:scale-[.99]" aria-label="SOS">
              <span className="text-xl font-bold text-danger-text">SOS</span>
              <span className="text-[13px] text-danger-text">{t('c05.emergency')}</span>
              <span className="ml-auto text-[11px] text-danger-text">{t('c05.sosHint')}</span>
            </button>
            <button className="btn-primary mt-5 w-full" onClick={() => end('arrived')}>{t('c05.arrived')}</button>
            <button className="mt-1 flex min-h-9 w-full items-center justify-center text-xs text-muted" onClick={() => end('cancelled')}>{t('c05.cancel')}</button>
          </div>
        </Sheet>
      </div>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
