// C-05 Walking mode
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { finishTrip, getTrip, listContacts, pushLocation } from '../api';
import { LOCATION_PUSH_SEC } from '../core/config';
import type { EmergencyContact, LatLng, Trip } from '../core/types';
import { Icon } from '../components/Icon';
import { FitBounds, FollowPos, MapView, token } from '../components/MapView';
import { ErrorBox, SimChip, Toast, TopBar, errKey } from '../components/ui';
import { fmtTime, useGeolocation } from '../components/geo';
import { useT } from '../i18n';
import { Marker, Polyline, Tooltip } from 'react-leaflet';
import { meIcon } from '../components/ReportMarkers';

/** Point at fraction f (0..1) along a polyline, by vertex count (good enough for the demo simulation). */
function along(g: [number, number][], f: number): LatLng {
  const x = Math.min(0.999, f) * (g.length - 1); const i = Math.floor(x); const r = x - i;
  return { lat: g[i][0] + (g[i + 1][0] - g[i][0]) * r, lng: g[i][1] + (g[i + 1][1] - g[i][1]) * r };
}

export default function WalkPage() {
  const { tripId = '' } = useParams(); const { t, lang } = useT(); const nav = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null); const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { pos: gps, status } = useGeolocation();
  const [simF, setSimF] = useState(0);
  const queue = useRef<(LatLng & { at: number })[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [follow, setFollow] = useState(false);
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
            {passed.length > 1 && <Polyline positions={passed} pathOptions={{ color: token('--color-route-safe', 0.35), weight: 7 }} />}
            <Polyline positions={g} pathOptions={{ color: '#fff', weight: 11 }} />
            <Polyline positions={g} pathOptions={{ color: token(trip.chosen === 'safest' ? '--color-route-safe' : '--color-route-fast'), weight: 6 }} />
            <FitBounds points={g} />
            {pos && <Marker position={[pos.lat, pos.lng]} icon={meIcon}><Tooltip permanent direction="right" offset={[22, 0]} className="route-label">{t('c05.you')}</Tooltip></Marker>}
            <FollowPos pos={follow ? pos : null} />
          </MapView>
        </div>
        <div className="absolute inset-x-6 top-2 z-[500] space-y-3">
          <div className="flex h-24 items-center gap-5 rounded-card bg-primary px-[17px] text-on-primary shadow-float">
            <Icon name="turn" size={36} />
            <div className="min-w-0">
              <p className="truncate text-xl font-bold">{t('c05.nextTitle', { place: trip.destination.label })}</p>
              <p className="mt-1 truncate text-[11px]">{t(trip.chosen === 'safest' ? 'c05.nextSafe' : 'c05.nextFast')}</p>
            </div>
          </div>
          <button onClick={share} className="flex h-[37px] w-full items-center justify-between rounded-card bg-primary-soft px-3.5 text-xs font-medium">
            <span className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-safe-line" />{contact ? t('c05.sharingWith', { name: contact }) : t('c05.sharing')}</span>
            <Icon name="share" size={17} className="text-safe-line" />
          </button>
        </div>
        <button onClick={() => setFollow((v) => !v)} aria-pressed={follow} aria-label={t('c01.myLocation')} className={`absolute bottom-10 right-6 z-[500] grid h-12 w-12 place-items-center rounded-full shadow-float ${follow ? 'bg-primary text-on-primary' : 'bg-surface'}`}><Icon name="locate" /></button>
      </div>
      <div className="sheet relative z-[600] -mt-5 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <div className="sheet-handle" />
        <div className="mt-5 flex items-baseline gap-8"><p className="text-[34px] font-bold leading-none">{t('common.min', { n: remaining })}</p><p className="text-sm text-muted">{t('c05.left', { m: leftM })}</p></div>
        <p className="mt-3 text-base font-medium">{t('c05.eta', { time: fmtTime(trip.eta, lang) })}</p>
        <div className="mt-2 flex flex-col items-center">
          <button aria-label="SOS" onClick={() => nav(`/sos?trip=${trip.id}`)} className="grid h-[86px] w-[86px] place-items-center rounded-full bg-danger text-on-primary shadow-[0_0_0_6px_rgb(var(--color-danger-soft))] active:scale-95">
            <span className="text-center leading-tight"><span className="block text-[26px] font-bold">SOS</span><span className="block text-[10px]">{t('c05.emergency')}</span></span>
          </button>
          <p className="mt-2 text-[11px] text-muted">{t('c05.sosHint')}</p>
        </div>
        <button className="btn-primary mt-2 min-h-11 w-full text-sm" onClick={() => end('arrived')}>{t('c05.arrived')}</button>
        <button className="mt-1 flex min-h-9 w-full items-center justify-center text-xs text-muted" onClick={() => end('cancelled')}>{t('c05.cancel')}</button>
      </div>
      {toast && <Toast>{toast}</Toast>}
    </div>
  );
}
