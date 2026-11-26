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
  const Card = ({ mode, title, lead, body, cta }: { mode: TravelMode; title: string; lead: string; body: string; cta: string }) => {
    const on = prefs.chosen ? prefs.mode === mode : mode === 'walk';
    return (
      <button onClick={() => choose(mode)} aria-pressed={prefs.chosen && prefs.mode === mode}
        className={`block w-full rounded-[24px] px-6 pb-6 pt-[22px] text-left transition active:scale-[.99] ${on ? 'bg-primary-soft' : 'bg-surface-2'}`}>
        <span className="flex items-center gap-2.5">
          <Icon name={mode === 'walk' ? 'walk' : 'wheelchair'} size={26} className="text-text" />
          <span className="text-2xl font-bold leading-9 text-text">{title}</span>
        </span>
        <span className="mt-2 block text-[15px] leading-[23px] text-text-2">{lead}</span>
        <span className="mt-2.5 block text-sm leading-[21px] text-muted">{body}</span>
        <span className="mt-4 block text-[15px] font-bold leading-[23px] text-primary">{cta}  ›</span>
      </button>
    );
  };
  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-8 pt-[max(3.75rem,env(safe-area-inset-top))]">
      <p className="text-[22px] font-bold leading-[33px] text-text">{APP_NAME}</p>
      <p className="mt-6 text-sm font-medium text-primary">{t('c00.eyebrow')}</p>
      <h1 className="mt-3 text-[30px] font-bold leading-[45px] text-text">{t('c00.title')}</h1>
      <p className="mt-3 text-[15px] text-muted">{t('c00.sub')}</p>
      <div className="mt-6 space-y-4">
        <Card mode="walk" title={t('mode.walk')} lead={t('c00.walkLead')} body={t('c00.walkBody')} cta={t('c00.walkCta')} />
        <Card mode="wheelchair" title={t('mode.wheelchair')} lead={t('c00.wcLead')} body={t('c00.wcBody')} cta={t('c00.wcCta')} />
      </div>
      <p className="mt-9 text-sm leading-[21px] text-muted">{t('c00.note')}</p>
    </div>
  );
}
