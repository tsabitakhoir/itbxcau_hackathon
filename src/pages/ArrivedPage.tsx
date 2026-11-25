// C-08 Arrival & route rating (Figma: EN · C-08 Arrival & rating)
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getTrip, listContacts, rateTrip } from '../api';
import type { EmergencyContact, Trip } from '../core/types';
import { Icon } from '../components/Icon';
import { TopBar, km, pts, scoreTone, toneText } from '../components/ui';
import { fmtTime } from '../components/geo';
import { useT, type TKey } from '../i18n';

const FEEL: TKey[] = ['c08.r1', 'c08.r2', 'c08.r3', 'c08.r4', 'c08.r5'];

export default function ArrivedPage() {
  const { tripId = '' } = useParams(); const { t, lang } = useT(); const nav = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null); const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [rating, setRating] = useState<0 | 1 | 2 | 3 | 4 | 5>(0); const [busy, setBusy] = useState(false);
  useEffect(() => { getTrip(tripId).then(setTrip).catch(() => undefined); listContacts().then(setContacts).catch(() => undefined); }, [tripId]);
  const arrivedAt = trip?.arrived_at ?? new Date().toISOString();
  const durMin = trip ? Math.max(1, Math.round((new Date(arrivedAt).getTime() - new Date(trip.started_at).getTime()) / 60e3)) : null;

  async function submit() {
    setBusy(true);
    try { if (rating) await rateTrip(tripId, rating); } finally { nav('/map', { replace: true }); }
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('c08.title')} onBack={() => nav('/map', { replace: true })} />
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="mx-auto mt-7 grid h-[84px] w-[84px] place-items-center rounded-full bg-safe-soft text-safe-line"><Icon name="check" size={44} /></div>
        <h2 className="mt-5 text-center text-[25px] font-bold">{t('c08.heading')}</h2>
        <p className="mt-1 text-center text-[13px] text-muted">{trip?.destination.label ?? ''} · {t('c08.arrivedAt', { time: fmtTime(arrivedAt, lang) })}</p>

        <div className="mt-5 flex h-[57px] items-center gap-4 rounded-card bg-primary-soft px-[17px] text-[13px] font-medium">
          <Icon name="lock" size={22} className="text-safe-line" />{contacts[0] ? t('c08.sharingEnded', { name: contacts[0].name }) : t('c08.sharingEndedGeneric')}
        </div>
        {trip && (
          <div className="mt-4 grid grid-cols-3 rounded-card bg-primary-soft px-5 py-4">
            <div><p className="text-[11px] text-muted">{t('c08.distance')}</p><p className="text-[19px] font-bold">{km(trip.route.length_m)}</p></div>
            <div><p className="text-[11px] text-muted">{t('c08.duration')}</p><p className="text-[19px] font-bold">{t('common.min', { n: durMin ?? 0 })}</p></div>
            <div><p className="text-[11px] text-muted">{t('c08.score')}</p><p className={`text-[19px] font-bold ${toneText[scoreTone(trip.route.score)]}`}>{pts(trip.route.score)} {t('common.pts')}</p></div>
          </div>
        )}

        <h3 className="mt-8 text-xl font-bold">{t('c08.ask')}</h3>
        <p className="mt-1 text-[11px] text-muted">{t('c08.askSub')}</p>
        <div className="mt-5 flex justify-center gap-4" role="radiogroup" aria-label={t('c08.ask')}>
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <button key={n} role="radio" aria-checked={rating === n} aria-label={`${n}/5`} onClick={() => setRating(n)} className={`grid h-12 w-12 place-items-center ${n <= rating ? 'text-primary' : 'text-star-empty'}`}>
              <Icon name="star" size={38} filled />
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between px-5 text-[10px] text-muted"><span>1  {t('c08.unsafe')}</span><span>{t('c08.verySafe')}  5</span></div>
        <div className="mx-auto mt-4 h-8 w-40">
          {rating > 0 && <p className={`grid h-8 place-items-center rounded-card bg-primary-soft text-[11px] font-bold ${rating >= 4 ? 'text-safe' : rating === 3 ? 'text-caution' : 'text-danger-text'}`}>{rating} / 5 · {t(FEEL[rating - 1])}</p>}
        </div>

        <hr className="mt-6 border-line" />
        <Link to="/report/new" className="mt-5 flex items-start gap-4">
          <Icon name="alert" size={21} className="mt-0.5 text-caution-line" />
          <span className="flex-1"><span className="block text-[13px] font-medium">{t('c08.reportTitle')}</span><span className="mt-1 block text-[10px] text-muted">{t('c08.reportSub')}</span></span>
          <Icon name="chev" size={19} />
        </Link>
      </div>
      <div className="px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2">
        <button className="btn-primary min-h-[53px] w-full text-sm" disabled={busy} onClick={submit}>{rating ? t('c08.submit') : t('c08.skip')}</button>
      </div>
    </div>
  );
}
