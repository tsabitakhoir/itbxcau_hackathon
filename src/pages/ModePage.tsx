// C-00 Choose your mode (Figma: C-00 Choose your mode · EN, node 64:2)
import { useNavigate, useSearchParams } from 'react-router-dom';
import { APP_NAME } from '../core/config';
import type { TravelMode } from '../core/types';
import { Icon } from '../components/Icon';
import { useT } from '../i18n';
import { useStore } from '../state/store';

export default function ModePage() {
  const { t } = useT(); const nav = useNavigate(); const [sp] = useSearchParams(); const { prefs, setPrefs } = useStore();
  const from = sp.get('from');
  const choose = (mode: TravelMode) => { setPrefs({ mode, chosen: true }); if (from === 'home') nav(-1); else nav('/map', { replace: true }); };
  const Card = ({ mode, title, body, cta }: { mode: TravelMode; title: string; body: string; cta: string }) => {
    const on = prefs.chosen ? prefs.mode === mode : mode === 'walk';
    return (
      <button onClick={() => choose(mode)} aria-pressed={prefs.chosen && prefs.mode === mode}
        className={`block w-full rounded-[22px] px-5 py-[18px] text-left transition active:scale-[.99] ${on ? 'bg-primary-soft' : 'bg-surface-2'}`}>
        <span className="flex items-center gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${on ? 'bg-surface text-primary' : 'bg-surface text-text-2'}`}>
            <Icon name={mode === 'walk' ? 'walk' : 'wheelchair'} size={23} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold leading-6 text-text">{title}</span>
            <span className="mt-0.5 block text-[13px] leading-5 text-text-2">{body}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">{cta}<Icon name="arrow" size={16} /></span>
        </span>
      </button>
    );
  };
  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-8 pt-[max(3.75rem,env(safe-area-inset-top))]">
      <img src="/gilon.jpeg" alt={APP_NAME} className="h-11 w-11 object-contain" />
      <p className="mt-7 text-xs font-semibold uppercase tracking-wide text-primary">{t('c00.eyebrow')}</p>
      <h1 className="page-heading mt-2 text-text">{t('c00.title')}</h1>
      <div className="mt-5 space-y-3">
        <Card mode="walk" title={t('mode.walk')} body={t('c00.walkBody')} cta={t('c00.walkCta')} />
        <Card mode="wheelchair" title={t('mode.wheelchair')} body={t('c00.wcBody')} cta={t('c00.wcCta')} />
      </div>
      <p className="mt-5 text-xs leading-5 text-muted">{t('c00.note')}</p>
    </div>
  );
}
