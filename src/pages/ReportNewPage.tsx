// S-05 Report an unsafe spot (create). Location = map center (defaults to current position).
import { useState } from 'react';
import { Marker, useMapEvents } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { createReport } from '../api';
import { CONFIRM_THRESHOLD } from '../core/config';
import type { LatLng, ReportCategory } from '../core/types';
import { Icon } from '../components/Icon';
import { MapView } from '../components/MapView';
import { meIcon } from '../components/ReportMarkers';
import { BottomNav, ErrorBox, Modal, SimChip, TopBar, errKey } from '../components/ui';
import { ITB_GATE, useGeolocation } from '../components/geo';
import { useT } from '../i18n';

const CATS: ReportCategory[] = ['dark', 'broken_light', 'deserted', 'harassment', 'other'];

function CenterPicker({ onMove }: { onMove: (p: LatLng) => void }) {
  useMapEvents({ moveend: (e) => { const c = e.target.getCenter(); onMove({ lat: c.lat, lng: c.lng }); } });
  return null;
}

export default function ReportNewPage() {
  const { t } = useT(); const nav = useNavigate(); const { pos } = useGeolocation();
  const [center, setCenter] = useState<LatLng | null>(null);
  const [cat, setCat] = useState<ReportCategory | null>(null); const [note, setNote] = useState(''); const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [sent, setSent] = useState(false); const [confirming, setConfirming] = useState(false);
  const at = center ?? pos ?? ITB_GATE;
  async function submit() {
    if (!cat) return; setBusy(true); setErr(null);
    try { await createReport({ pos: at, category: cat, note: note.trim() || undefined, photo: photo ?? undefined }); setConfirming(false); setSent(true); }
    catch (e) { setConfirming(false); setErr(t(errKey(e))); } finally { setBusy(false); }
  }
  return (
    <div className="relative flex h-full flex-col">
      <TopBar title={t('s05.title')} right={<SimChip className="mr-3" />} />
      <div className="flex-1 overflow-y-auto px-6 pb-48">
        <div className="relative h-44 overflow-hidden rounded-card">
          <MapView center={[at.lat, at.lng]} zoom={17}>
            <CenterPicker onMove={setCenter} />
            {pos && <Marker position={[pos.lat, pos.lng]} icon={meIcon} />}
          </MapView>
          <Icon name="pin" size={34} className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full text-danger" />
        </div>
        <p className="mt-2 text-[11px] text-muted">{t('s05.location')}</p>
        <h2 className="mt-5 text-base font-bold">{t('s05.category')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {CATS.map((c) => <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className={`flex h-12 items-center gap-2 rounded-card px-3.5 text-left text-xs ${cat === c ? 'bg-primary-soft-2 font-bold text-primary-strong' : 'bg-surface-2 font-medium text-muted'}`}>{cat === c && <Icon name="check" size={18} className="text-safe-line" />}{t(`category.${c}`)}</button>)}
        </div>
        <h2 className="mt-5 text-base font-bold">{t('s05.photo')}</h2>
        <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-card bg-surface-2 px-4 text-sm">
          <Icon name="camera" size={20} className="text-muted" /><span className="flex-1 truncate">{photo?.name ?? t('s05.photoPick')}</span>
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        <p className="mt-1 text-[11px] text-danger-text">{t('s05.photoNote')}</p>
        <h2 className="mt-5 text-base font-bold">{t('s05.note')}</h2>
        <textarea className="input mt-3 min-h-20 py-3" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="mt-3 text-[11px] text-muted">{t('s05.threshold', { n: CONFIRM_THRESHOLD })}</p>
        {err && <div className="mt-3"><ErrorBox message={err} /></div>}
      </div>
      <div className="absolute inset-x-0 bottom-[81px] z-[600] bg-gradient-to-t from-bg via-bg to-transparent px-6 pb-3 pt-6">
        <button className="btn-primary w-full" disabled={!cat || busy} onClick={() => setConfirming(true)}>{t('s05.submit')}</button>
      </div>
      <BottomNav active="report" />
      {confirming && cat && (
        <Modal title={t('s05.confirmTitle')}
          actions={<>
            <button className="btn h-12 flex-1 rounded-[14px] bg-surface-2 text-sm font-medium text-text-2" disabled={busy} onClick={() => setConfirming(false)}>{t('s05.edit')}</button>
            <button className="btn-primary h-12 flex-1" disabled={busy} onClick={submit}>{busy ? t('common.loading') : t('s05.submit')}</button>
          </>}>
          <p className="font-bold text-text">{t(`category.${cat}`)}</p>
          {note.trim() && <p className="mt-1 break-words">{note.trim()}</p>}
          {photo && <p className="mt-1 truncate text-xs text-muted">{photo.name}</p>}
          <p className="mt-2 text-xs text-muted">{t('s05.confirmAsk')}</p>
        </Modal>
      )}
      {sent && (
        <Modal title={t('s05.sentTitle')} actions={<button className="btn-primary h-12 w-full" onClick={() => nav('/map', { replace: true })}>{t('s05.sentOk')}</button>}>
          {t('s05.sentBody', { n: CONFIRM_THRESHOLD })}
        </Modal>
      )}
    </div>
  );
}
