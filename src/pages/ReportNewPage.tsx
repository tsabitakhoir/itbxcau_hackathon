// S-05 Report an unsafe spot (create). Location = map center (defaults to current position).
import { useEffect, useState } from 'react';
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
  // Preview of the chosen photo, shown in the confirm and "sent" popups.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) { setPhotoUrl(null); return; }
    const url = URL.createObjectURL(photo); setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const preview = photoUrl && <img src={photoUrl} alt={t('s05.photoAlt')} className="mt-3 max-h-48 w-full rounded-[14px] object-cover" />;
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
        <div className="mt-3 grid grid-cols-2 gap-2">
          {([['camera', 's05.photoCamera', 'camera'], ['gallery', 's05.photoGallery', 'layers']] as const).map(([k, label, icon]) => (
            <label key={k} className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-card bg-surface-2 px-3 text-xs font-medium text-text-2 focus-within:ring-2 focus-within:ring-primary">
              <Icon name={icon} size={18} className="text-muted" />{t(label)}
              {/* The camera input opens the camera; the gallery input has no `capture`, so the phone shows its photo library. */}
              <input type="file" accept="image/*" {...(k === 'camera' ? { capture: 'environment' as const } : {})} className="sr-only"
                onChange={(e) => { setPhoto(e.target.files?.[0] ?? photo); e.target.value = ''; }} />
            </label>
          ))}
        </div>
        {photo && photoUrl && (
          <div className="mt-3 flex items-center gap-3 rounded-card bg-surface-2 p-2.5">
            <img src={photoUrl} alt={t('s05.photoAlt')} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
            <span className="min-w-0 flex-1 truncate text-xs text-text-2">{photo.name}</span>
            <button type="button" aria-label={t('s05.photoRemove')} onClick={() => setPhoto(null)} className="grid h-11 w-11 shrink-0 place-items-center text-muted"><Icon name="x" size={18} /></button>
          </div>
        )}
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
          {preview}
          <p className="mt-2 text-xs text-muted">{t('s05.confirmAsk')}</p>
        </Modal>
      )}
      {sent && (
        <Modal title={t('s05.sentTitle')} actions={<button className="btn-primary h-12 w-full" onClick={() => nav('/map', { replace: true })}>{t('s05.sentOk')}</button>}>
          {t('s05.sentBody', { n: CONFIRM_THRESHOLD })}
          {preview}
        </Modal>
      )}
    </div>
  );
}
