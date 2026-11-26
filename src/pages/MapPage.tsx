// C-01 Home map (Figma: C-01 Home map · EN, node 64:27)
import { useEffect, useState } from 'react';
import { Marker, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { getActivityHeatmap, listReports } from '../api';
import { APP_NAME } from '../core/config';
import type { HeatPoint, LatLng, Report } from '../core/types';
import { Icon } from '../components/Icon';
import { HeatLayer, MapView } from '../components/MapView';
import { ReportMarkers, meIcon } from '../components/ReportMarkers';
import { BottomNav, SosButton, Toast, Toggle } from '../components/ui';
import { fmtTime, useGeolocation } from '../components/geo';
import { speak, stopSpeaking, voiceSupported } from '../components/voice';
import { useT } from '../i18n';
import { useStore } from '../state/store';

function Recenter({ pos, tick }: { pos: LatLng | null; tick: number }) {
  const map = useMap();
  useEffect(() => { if (pos && tick) map.flyTo([pos.lat, pos.lng], 17); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function MapPage() {
  const { t, lang } = useT(); const nav = useNavigate(); const { departure, prefs, setPrefs } = useStore();
  const { pos, status } = useGeolocation();
  const [heatOn, setHeatOn] = useState(false);
  const [heat, setHeat] = useState<HeatPoint[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [recenter, setRecenter] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { listReports().then(setReports).catch(() => undefined); }, []);
  useEffect(() => { if (heatOn) getActivityHeatmap(departure ? new Date(departure) : new Date()).then(setHeat).catch(() => undefined); }, [heatOn, departure]);
  const depLabel = departure && new Date(departure) > new Date() ? fmtTime(departure, lang) : t('c01.departNow');

  function setVoice(on: boolean) {
    setPrefs({ voice: on });
    if (on && !voiceSupported()) { setToast(t('voice.unsupported')); setTimeout(() => setToast(null), 2500); return; }
    if (on) speak(t('voice.on'), lang); else stopSpeaking();
  }

  return (
    <div className="relative h-full">
      <div className="absolute inset-0 top-[260px]">
        <MapView>
          {heatOn && heat.length > 0 && <HeatLayer points={heat} />}
          <ReportMarkers reports={reports} />
          {pos && <Marker position={[pos.lat, pos.lng]} icon={meIcon} />}
          <Recenter pos={pos} tick={recenter} />
        </MapView>
      </div>

      <div className="absolute inset-x-0 top-0 z-[500] bg-surface px-5 pb-2.5 pt-[max(3.25rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between">
          <img src="/gilon.jpeg" alt={APP_NAME} className="h-11 w-11 shrink-0 object-contain" />
          <button onClick={() => nav('/mode?from=home')} className="-mr-1 -mt-1 min-h-11 rounded-full bg-surface-2 px-3 text-left" aria-label={`${t('c01.travelSettings')}: ${t(`mode.${prefs.mode}`)}`}>
            <span className="flex items-center gap-1.5 text-xs font-medium text-text-2"><Icon name={prefs.mode === 'walk' ? 'walk' : 'wheelchair'} size={14} />{t(`mode.${prefs.mode}`)}<Icon name="chevDown" size={15} className="text-muted" /></span>
          </button>
        </div>
        <h1 className="page-heading mt-2 text-text">{t('c01.heading')}</h1>
        <button onClick={() => nav('/plan')} className="mt-2 flex h-12 w-full items-center gap-3 rounded-2xl bg-surface-2 px-4 text-left">
          <Icon name="search" size={20} className="text-muted" />
          <span className="text-[15px] font-medium text-muted">{t('c01.search')}</span>
        </button>
        <div className="mt-2 flex items-center justify-between">
          <button onClick={() => nav('/plan')} className="flex min-h-10 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs font-medium text-text-2"><Icon name="clock" size={14} />{depLabel}<Icon name="chevDown" size={15} className="text-muted" /></button>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-text-2"><Icon name="volume" size={15} />{t('c01.voice')}</span>
            <Toggle on={prefs.voice} onChange={setVoice} label={t('c01.voice')} />
          </div>
        </div>
      </div>

      <div className="absolute bottom-[105px] right-[30px] z-[500] flex flex-col items-center gap-4">
        <SosButton />
        <button onClick={() => setHeatOn((v) => !v)} aria-pressed={heatOn} aria-label={t('c01.heatmap')} className={`grid h-12 w-12 place-items-center rounded-full shadow-float ${heatOn ? 'bg-primary text-on-primary' : 'bg-surface'}`}><Icon name="layers" /></button>
        <button onClick={() => setRecenter((n) => n + 1)} aria-label={t('c01.myLocation')} className="grid h-12 w-12 place-items-center rounded-full bg-surface shadow-float"><Icon name="locate" /></button>
      </div>
      <BottomNav active="home" />
      {toast ? <Toast>{toast}</Toast> : status === 'fallback' && <Toast>{t('c01.locationFallback')}</Toast>}
    </div>
  );
}
