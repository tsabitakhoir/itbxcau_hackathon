// S-01 Splash + face scan (MOCKUP ONLY: no camera, nothing recorded or stored)
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_NAME } from '../core/config';
import { Icon } from '../components/Icon';
import { useT } from '../i18n';

export default function SplashPage() {
  const { t } = useT(); const nav = useNavigate();
  const [phase, setPhase] = useState<'scan' | 'ok'>('scan');
  const next = () => { let onboarded = false; try { onboarded = localStorage.getItem('onboarded') === '1'; } catch { /* ignore */ } let chosen = false; try { chosen = (JSON.parse(localStorage.getItem('gil-prefs') ?? '{}') as { chosen?: boolean }).chosen === true; } catch { /* ignore */ } nav(!onboarded ? '/onboarding' : chosen ? '/map' : '/mode', { replace: true }); };
  useEffect(() => { const a = setTimeout(() => setPhase('ok'), 1600); const b = setTimeout(next, 2400); return () => { clearTimeout(a); clearTimeout(b); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
      <img src="/gilon.jpeg" alt={APP_NAME} className="h-20 w-20 object-contain" />
      <p className="-mt-4 text-sm text-muted">{t('c01.tagline')}</p>
      <div className="relative mt-6 grid h-40 w-40 place-items-center rounded-full bg-primary-soft">
        <Icon name={phase === 'ok' ? 'check' : 'user'} size={64} className={phase === 'ok' ? 'text-safe-line' : 'text-primary'} />
        {phase === 'scan' && <span className="absolute inset-0 animate-ping rounded-full border-4 border-primary/40" />}
      </div>
      <p className="text-sm font-medium">{t(phase === 'ok' ? 's01.ok' : 's01.scanning')}</p>
      <p className="max-w-xs text-[11px] text-muted">{t('s01.mockNote')}</p>
      <button className="btn text-sm text-muted" onClick={next}>{t('s01.skip')}</button>
    </div>
  );
}
