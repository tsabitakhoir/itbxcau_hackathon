// S-03 ID verification — MOCKUP ONLY: no camera, no OCR, nothing uploaded. Only the id_verified_mock flag is saved.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateProfile } from '../api';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/ui';
import { useT } from '../i18n';
import { useStore } from '../state/store';

export default function VerifyPage() {
  const { t } = useT(); const nav = useNavigate(); const { setProfile } = useStore();
  const [state, setState] = useState<'idle' | 'scanning' | 'done'>('idle');
  async function scan() { setState('scanning'); await new Promise((r) => setTimeout(r, 1800)); setProfile(await updateProfile({ id_verified_mock: true })); setState('done'); }
  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('s03.title')} />
      <div className="flex flex-1 flex-col px-6 pb-8">
        <p className="mt-2 text-sm text-muted">{t('s03.body')}</p>
        <div className="relative mt-8 grid aspect-[1.6] place-items-center overflow-hidden rounded-card border-2 border-dashed border-border bg-surface">
          <Icon name={state === 'done' ? 'check' : 'id'} size={72} className={state === 'done' ? 'text-safe-line' : 'text-muted'} />
          {state === 'scanning' && <span className="absolute inset-x-0 top-0 h-1 animate-[scan_1.8s_linear_infinite] bg-primary" />}
        </div>
        <p className="mt-4 rounded-card bg-primary-soft p-3 text-[11px] text-muted">{t('s03.mockNote')}</p>
        <div className="mt-auto space-y-2">
          {state === 'done'
            ? <button className="btn-primary w-full" onClick={() => nav('/contacts?next=/map')}><Icon name="check" size={20} />{t('s03.done')}</button>
            : <button className="btn-primary w-full" disabled={state === 'scanning'} onClick={scan}><Icon name="camera" size={20} />{state === 'scanning' ? t('common.loading') : t('s03.scan')}</button>}
          <button className="btn w-full text-sm text-muted" onClick={() => nav('/contacts?next=/map')}>{t('s03.later')}</button>
        </div>
      </div>
    </div>
  );
}
