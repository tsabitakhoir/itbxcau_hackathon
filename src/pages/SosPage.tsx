// C-06 SOS (Figma: EN · C-06 SOS) — 3 s countdown with cancel, then call + share location
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listContacts, resolveSos, triggerSos } from '../api';
import { EMERGENCY_NUMBERS } from '../core/config';
import type { EmergencyContact, SosResult } from '../core/types';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/ui';
import { useGeolocation } from '../components/geo';
import { useT } from '../i18n';
import { useStore } from '../state/store';

export default function SosPage() {
  const { t } = useT(); const nav = useNavigate(); const [sp] = useSearchParams(); const tripId = sp.get('trip') ?? undefined;
  const { profile } = useStore(); const country = profile?.country ?? 'ID'; const number = EMERGENCY_NUMBERS[country];
  const { pos } = useGeolocation();
  const [count, setCount] = useState(3); const [res, setRes] = useState<SosResult | null>(null);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const fired = useRef(false);
  useEffect(() => { listContacts().then(setContacts).catch(() => undefined); }, []);
  useEffect(() => { if (count <= 0) return; const id = setTimeout(() => setCount((c) => c - 1), 1000); return () => clearTimeout(id); }, [count]);
  useEffect(() => {
    if (count > 0 || fired.current) return; fired.current = true;
    triggerSos({ trip_id: tripId, pos, country }).then((r) => { setRes(r); if (!r.demo) window.location.href = r.tel_uri; void shareLoc(r); }).catch(() => undefined);
  }, [count, tripId, pos, country]);

  async function shareLoc(r: SosResult) {
    try { if (navigator.share) { await navigator.share({ text: r.share_text, url: r.share_url ?? undefined }); return; } } catch { return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${r.share_text} ${r.share_url ?? ''}`)}`, '_blank');
  }
  async function safe() { if (res) await resolveSos(res.sos_id); nav(tripId ? `/walk/${tripId}` : '/map', { replace: true }); }
  const contact = contacts[0]?.name ?? t('c06.yourContact');
  const demo = res?.demo ?? (import.meta.env.VITE_DEMO_MODE === 'true');

  const Step = ({ n, active, title, sub, note }: { n: number; active: boolean; title: string; sub: string; note?: string }) => (
    <div className="relative flex gap-5">
      <span className={`z-10 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-sm font-bold ${active ? 'bg-danger text-on-primary' : 'bg-surface text-text'}`}>{n}</span>
      <div><p className="text-[15px] font-bold">{title}</p><p className="mt-1 text-[13px] text-muted">{sub}</p>{note && <p className="mt-1 text-[11px] text-muted">{note}</p>}</div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('c06.title')} onBack={() => (res ? safe() : nav(-1))}
        right={demo ? <span className="mr-3 rounded-[14px] bg-surface-2 px-3.5 py-1.5 text-[11px] font-medium text-danger-text">{t('c06.demo')}</span> : undefined} />
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {!res ? <>
          <h2 className="page-heading mt-6">{t('c06.heading')}</h2>
          <p className="mt-2 text-sm text-muted">{t('c06.sub', { n: 3 })}</p>
          <div className="mx-auto mt-8 grid h-[186px] w-[186px] place-items-center rounded-full bg-danger-soft">
            <div className="grid h-[162px] w-[162px] place-items-center rounded-full bg-danger text-on-primary" aria-live="assertive">
              <div className="text-center"><p className="text-[60px] font-bold leading-none">{Math.max(count, 0)}</p><p className="mt-2 text-xs font-medium">{t('c06.secondsTo')}</p></div>
            </div>
          </div>
          <p className="mt-6 text-center text-[13px] text-muted">{t('c06.mistake')}</p>
          <button className="btn-ghost mt-4 w-full" onClick={() => nav(-1)} disabled={count <= 0}>{t('c06.cancel')}</button>
        </> : <>
          <div className="mt-6 flex items-center gap-3">
            <span className="relative flex h-4 w-4"><span className="absolute h-full w-full animate-ping rounded-full bg-danger" /><span className="relative h-4 w-4 rounded-full bg-danger" /></span>
            <h2 className="page-heading">{t('c06.active')}</h2>
          </div>
          <p className="mt-2 text-sm text-muted">{t('c06.activeBody', { name: contact })}</p>
          <div className="mt-6 space-y-3">
            <a href={res.demo ? undefined : res.tel_uri} onClick={(e) => res.demo && e.preventDefault()} className="btn-danger w-full"><Icon name="phone" size={20} />{t('c06.callAgain', { number })}</a>
            <button className="btn-ghost w-full" onClick={() => shareLoc(res)}><Icon name="share" size={20} />{t('c06.shareAgain')}</button>
            <button className="btn-primary w-full" onClick={safe}><Icon name="check" size={20} />{t('c06.safe')}</button>
          </div>
        </>}

        <h3 className="mt-9 text-[17px] font-bold">{t('c06.after')}</h3>
        <div className="relative mt-4 space-y-8">
          <span className="absolute left-[14px] top-2 h-[100px] w-0.5 bg-line" />
          <Step n={1} active={!res || true} title={t('c06.step1')} sub={t('c06.step1Sub', { number, country: t(country === 'KR' ? 'country.KR' : 'country.ID') })} note={t('c06.step1Note')} />
          <Step n={2} active={!!res} title={t('c06.step2')} sub={t('c06.step2Sub', { name: contact })} />
        </div>
        {demo && (
          <div className="mt-8 flex gap-3 rounded-card bg-danger-soft px-4 py-3.5 text-danger-text">
            <Icon name="lock" size={20} className="mt-0.5 shrink-0" />
            <div><p className="text-[11px] font-medium">{t('c06.demoNote')}</p><p className="mt-1 text-[10px]">{t('c06.demoNote2')}</p></div>
          </div>
        )}
      </div>
    </div>
  );
}
