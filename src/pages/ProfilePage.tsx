// S-06 Profile & settings
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { resetMockData, updateProfile } from '../api';
import { DEMO_MODE, EMERGENCY_NUMBERS } from '../core/config';
import type { Country, Lang, TravelMode } from '../core/types';
import { Icon } from '../components/Icon';
import { BottomNav, Toggle, TopBar } from '../components/ui';
import { speak, stopSpeaking } from '../components/voice';
import { useT } from '../i18n';
import { useStore } from '../state/store';

export default function ProfilePage() {
  const { t, lang, setLang } = useT(); const { profile, setProfile, prefs, setPrefs } = useStore();
  const [name, setName] = useState(profile?.display_name ?? '');
  const save = async (p: Parameters<typeof updateProfile>[0]) => setProfile(await updateProfile(p));
  const Seg = <T extends string>({ value, opts, onChange }: { value: T; opts: [T, string][]; onChange: (v: T) => void }) => (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${opts.length},1fr)` }}>
      {opts.map(([v, l]) => <button key={v} onClick={() => onChange(v)} aria-pressed={value === v} className={`h-11 rounded-xl text-xs ${value === v ? 'bg-primary font-bold text-on-primary' : 'bg-surface-2 text-muted'}`}>{l}</button>)}
    </div>
  );
  return (
    <div className="relative flex h-full flex-col">
      <TopBar title={t('s06.title')} back={false} />
      <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-28">
        <section className="card space-y-2">
          <label className="text-[11px] text-muted" htmlFor="dn">{t('s06.name')}</label>
          <input id="dn" className="input bg-surface" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && save({ display_name: name.trim() })} />
        </section>
        <section className="card space-y-3">
          <p className="text-[11px] text-muted">{t('c01.travelSettings')}</p>
          <Seg<TravelMode> value={prefs.mode} opts={[['walk', t('mode.walk')], ['wheelchair', t('mode.wheelchair')]]} onChange={(m) => setPrefs({ mode: m, chosen: true })} />
          <div className="flex items-center justify-between pt-1">
            <span><span className="block text-sm font-medium text-text">{t('c01.voice')}</span><span className="block text-[11px] text-muted">{t('s06.voiceSub')}</span></span>
            <Toggle on={prefs.voice} label={t('c01.voice')} onChange={(v) => { setPrefs({ voice: v }); if (v) speak(t('voice.on'), lang); else stopSpeaking(); }} />
          </div>
        </section>
        <section className="card space-y-3">
          <p className="text-[11px] text-muted">{t('s02.language')}</p>
          <Seg<Lang> value={lang} opts={[['en', 'English'], ['id', 'Indonesia'], ['ko', '한국어']]} onChange={(l) => { setLang(l); void save({ lang: l }); }} />
          <p className="pt-2 text-[11px] text-muted">{t('s02.country')}</p>
          <Seg<Country> value={profile?.country ?? 'ID'} opts={[['ID', t('s02.countryID')], ['KR', t('s02.countryKR')]]} onChange={(c) => save({ country: c })} />
          <p className="text-[11px] text-muted">{t('s06.sosNumber', { number: EMERGENCY_NUMBERS[profile?.country ?? 'ID'] })}</p>
        </section>
        <Link to="/contacts" className="card flex min-h-14 items-center gap-3"><Icon name="phone" size={20} className="text-primary" /><span className="flex-1 font-medium">{t('s06.contacts')}</span><Icon name="chev" size={18} /></Link>
        <Link to="/verify" className="card flex min-h-14 items-center gap-3"><Icon name="id" size={20} className="text-primary" /><span className="flex-1 font-medium">{t('s06.verify')}</span>
          <span className={`text-xs ${profile?.id_verified_mock ? 'text-safe' : 'text-muted'}`}>{t(profile?.id_verified_mock ? 's06.verified' : 's06.notVerified')}</span></Link>
        {DEMO_MODE && <p className="rounded-card bg-danger-soft p-3 text-center text-xs font-medium text-danger-text">{t('common.demoMode')}</p>}
        <button className="btn w-full text-sm text-muted" onClick={() => { resetMockData(); location.href = '/'; }}>{t('s06.reset')}</button>
      </div>
      <BottomNav active="profile" />
    </div>
  );
}
