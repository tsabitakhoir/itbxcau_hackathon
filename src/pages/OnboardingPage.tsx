// S-02 Onboarding: language + country
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateProfile } from '../api';
import { APP_NAME } from '../core/config';
import type { Country, Lang } from '../core/types';
import { Icon } from '../components/Icon';
import { useT } from '../i18n';
import { useStore } from '../state/store';

export default function OnboardingPage() {
  const { t, lang, setLang } = useT(); const nav = useNavigate(); const { profile, setProfile } = useStore();
  const country = profile?.country ?? 'ID';
  const setCountry = async (c: Country) => setProfile(await updateProfile({ country: c }));
  async function go() { setProfile(await updateProfile({ lang })); try { localStorage.setItem('onboarded', '1'); } catch { /* ignore */ } nav('/contacts?next=/mode'); }
  const Opt = ({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) => (
    <button onClick={onClick} aria-pressed={on} className={`flex h-12 items-center gap-2 rounded-card px-4 text-sm ${on ? 'bg-primary-soft-2 font-bold text-primary-strong' : 'bg-surface-2 font-medium text-muted'}`}>{on && <Icon name="check" size={18} className="text-safe-line" />}{children}</button>
  );
  return (
    <div className="flex h-full flex-col px-6 pb-8 pt-16">
      <p className="text-[26px] font-extrabold tracking-[-0.03em] text-primary">{APP_NAME}</p>
      <h1 className="mt-8 text-2xl font-bold">{t('s02.title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('s02.body')}</p>
      <h2 className="mt-8 text-base font-bold">{t('s02.language')}</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {([['en', 'English'], ['id', 'Indonesia'], ['ko', '한국어']] as [Lang, string][]).map(([l, n]) => <Opt key={l} on={lang === l} onClick={() => setLang(l)}>{n}</Opt>)}
      </div>
      <h2 className="mt-6 text-base font-bold">{t('s02.country')}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Opt on={country === 'ID'} onClick={() => setCountry('ID')}>{t('s02.countryID')}</Opt>
        <Opt on={country === 'KR'} onClick={() => setCountry('KR')}>{t('s02.countryKR')}</Opt>
      </div>
      <button className="btn-primary mt-auto w-full" onClick={go}>{t('s02.next')}</button>
    </div>
  );
}
