import { useEffect, useState } from 'react';
import type { LatLng } from '../core/types';

export const ITB_GATE: LatLng & { label: string } = { lat: -6.8932, lng: 107.6105, label: 'ITB Ganesha Gate' };

/** watchPosition with high accuracy; falls back to ITB Ganesha Gate. */
export function useGeolocation() {
  const [pos, setPos] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<'locating' | 'ok' | 'fallback'>('locating');
  useEffect(() => {
    if (!('geolocation' in navigator)) { setPos(ITB_GATE); setStatus('fallback'); return; }
    const timer = setTimeout(() => setStatus((s) => { if (s === 'locating') { setPos(ITB_GATE); return 'fallback'; } return s; }), 6000);
    const id = navigator.geolocation.watchPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setStatus('ok'); },
      () => { setPos((cur) => cur ?? ITB_GATE); setStatus('fallback'); },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => { clearTimeout(timer); navigator.geolocation.clearWatch(id); };
  }, []);
  return { pos, status };
}

export const fmtTime = (iso: string | Date, lang: string) =>
  new Date(iso).toLocaleTimeString(lang === 'ko' ? 'ko-KR' : lang === 'id' ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
