// C-01 Home map (Figma: EN · C-01 Home map, EN · Location 1/2)
import { useEffect, useState } from 'react';
import { Marker, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { getActivityHeatmap, listReports } from '../api';
import { APP_NAME } from '../core/config';
import type { HeatPoint, LatLng, Report } from '../core/types';
import { Icon } from '../components/Icon';
import { HeatLayer, MapView } from '../components/MapView';
import { ReportMarkers, meIcon } from '../components/ReportMarkers';
import { BottomNav, SimChip, SosButton, Toast, Toggle } from '../components/ui';
import { fmtTime, useGeolocation } from '../components/geo';
import { useT } from '../i18n';
import { useStore } from '../state/store';

function Recenter({ pos, tick }: { pos: LatLng | null; tick: number }) {
  const map = useMap();
  useEffect(() => { if (pos && tick) map.flyTo([pos.lat, pos.lng], 17); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function MapPage() {
  const { t, lang } = useT(); const nav = useNavigate(); const { departure } = useStore();
  const { pos, status } = useGeolocation();
  const [heatOn, setHeatOn] = useState(false);
  const [heat, setHeat] = useState<HeatPoint[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [recenter, setRecenter] = useState(0);
  useEffect(() => { listReports().then(setReports).catch(() => undefined); }, []);
  useEffect(() => { if (heatOn) getActivityHeatmap(departure ? new Date(departure) : new Date()).then(setHeat).catch(() => undefined); }, [heatOn, departure]);
  const depLabel = departure && new Date(departure) > new Date() ? fmtTime(departure, lang) : t('c01.departNow');

  return (
    <div className="relative h-full">
      <div className="absolute inset-0">
        <MapView>
          {heatOn && heat.length > 0 && <HeatLayer points={heat} />}
          <ReportMarkers reports={reports} />
          {pos && <Marker position={[pos.lat, pos.lng]} icon={meIcon} />}
          <Recenter pos={pos} tick={recenter} />
        </MapView>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-bg via-bg/70 to-transparent" />

      <div className="absolute inset-x-0 top-0 z-[500] px-5 pt-[max(3.5rem,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[26px] font-extrabold leading-none tracking-[-0.03em] text-primary">{APP_NAME}</p>
            <p className="mt-3 text-[13px] text-muted">{t('c01.tagline')}</p>
          </div>
          <SimChip className="mt-1" />
        </div>
        <button onClick={() => nav('/plan')} className="mt-4 flex h-[60px] w-full items-center gap-4 rounded-card bg-surface px-[18px] text-left shadow-float">
          <Icon name="search" />
          <span className="text-lg font-bold">{t('c01.search')}</span>
        </button>
        <div className="mt-3 flex gap-[11px]">
          <button onClick={() => nav('/plan')} className="flex h-10 items-center gap-2 rounded-card bg-surface px-3 text-[13px] font-medium shadow-float">
            <Icon name="clock" size={17} />{depLabel}<span className="text-muted">⌄</span>
          </button>
          <div className="flex h-10 flex-1 items-center justify-between rounded-card bg-surface pl-[15px] pr-4 text-[13px] font-medium shadow-float">
            {t('c01.heatmap')}<Toggle on={heatOn} onChange={setHeatOn} label={t('c01.heatmap')} />
          </div>
        </div>
      </div>

      <div className="absolute bottom-[105px] right-[30px] z-[500] flex flex-col items-center gap-4">
        <SosButton />
        <button onClick={() => setRecenter((n) => n + 1)} aria-label={t('c01.myLocation')} className="grid h-12 w-12 place-items-center rounded-full bg-surface shadow-float"><Icon name="locate" /></button>
      </div>
      <BottomNav active="home" />
      {status === 'fallback' && <Toast>{t('c01.locationFallback')}</Toast>}
    </div>
  );
}
