// S-04 Emergency contacts
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { addContact, deleteContact, listContacts } from '../api';
import type { EmergencyContact } from '../core/types';
import { Icon } from '../components/Icon';
import { Skeleton, TopBar } from '../components/ui';
import { useT } from '../i18n';

export default function ContactsPage() {
  const { t } = useT(); const nav = useNavigate(); const [sp] = useSearchParams(); const next = sp.get('next');
  const [list, setList] = useState<EmergencyContact[] | null>(null);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [channel, setChannel] = useState<EmergencyContact['channel']>('whatsapp');
  useEffect(() => { listContacts().then(setList).catch(() => setList([])); }, []);
  const valid = name.trim() && /^\+\d{8,15}$/.test(phone.replace(/[\s-]/g, ''));
  async function add() { if (!valid) return; const c = await addContact({ name: name.trim(), phone: phone.replace(/[\s-]/g, ''), channel }); setList((l) => [...(l ?? []), c]); setName(''); setPhone(''); }
  return (
    <div className="flex h-full flex-col">
      <TopBar title={t('s04.title')} />
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <p className="text-sm text-muted">{t('s04.body')}</p>
        <ul className="mt-5 space-y-2">
          {!list ? <Skeleton className="h-16" /> : list.length === 0 ? <li className="rounded-card bg-surface p-4 text-sm text-muted">{t('s04.empty')}</li> : list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-card bg-surface p-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary"><Icon name="user" size={20} /></span>
              <span className="flex-1"><span className="block font-bold">{c.name}</span><span className="text-xs text-muted">{c.phone} · {c.channel}</span></span>
              <button aria-label={t('s04.delete', { name: c.name })} onClick={async () => { await deleteContact(c.id); setList((l) => l?.filter((x) => x.id !== c.id) ?? null); }} className="grid h-11 w-11 place-items-center text-muted"><Icon name="trash" size={20} /></button>
            </li>
          ))}
        </ul>
        <div className="mt-6 space-y-3 rounded-card bg-surface p-4">
          <input className="input" placeholder={t('s04.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" inputMode="tel" placeholder={t('s04.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            {(['whatsapp', 'kakao', 'sms'] as const).map((ch) => <button key={ch} onClick={() => setChannel(ch)} aria-pressed={channel === ch} className={`h-10 rounded-xl text-xs capitalize ${channel === ch ? 'bg-primary font-bold text-on-primary' : 'bg-surface-2 text-muted'}`}>{ch}</button>)}
          </div>
          <button className="btn-primary w-full" disabled={!valid} onClick={add}>{t('s04.add')}</button>
        </div>
      </div>
      {next && <div className="px-6 pb-8"><button className="btn-ghost w-full" onClick={() => nav(next, { replace: true })}>{t('s02.next')}</button></div>}
    </div>
  );
}
