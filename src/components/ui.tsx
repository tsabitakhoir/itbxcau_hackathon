import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { SCORE_BANDS } from '../core/config';
import { ApiError, type Reason, type RouteOption } from '../core/types';
import { useT, type TKey } from '../i18n';
import { Icon } from './Icon';

/** Contract scores are 1.0-5.0; the design shows them as points out of 100. */
// eslint-disable-next-line react-refresh/only-export-components
export const pts = (score: number) => Math.round(score * 20);
// eslint-disable-next-line react-refresh/only-export-components
export const scoreTone = (s: number) => (s >= SCORE_BANDS.safe ? 'safe' : s >= SCORE_BANDS.caution ? 'caution' : 'danger');
// eslint-disable-next-line react-refresh/only-export-components
export const toneText = { safe: 'text-safe', caution: 'text-caution', danger: 'text-danger-text' } as const;
// eslint-disable-next-line react-refresh/only-export-components
export function errKey(e: unknown): TKey {
  if (e instanceof ApiError && ['OUT_OF_AREA', 'NO_ROUTE', 'NOT_FOUND', 'OWN_REPORT', 'ALREADY_CONFIRMED', 'PHOTO_TOO_LARGE'].includes(e.code)) return `error.${e.code}` as TKey;
  return 'error.generic';
}
// eslint-disable-next-line react-refresh/only-export-components
export const minutes = (r: RouteOption) => Math.round(r.duration_s / 60);
// eslint-disable-next-line react-refresh/only-export-components
export const km = (m: number) => `${(m / 1000).toFixed(1)}km`;

export function SimChip({ className = '' }: { className?: string }) {
  const { t } = useT();
  return <span className={`chip ${className}`}><span className="h-1.5 w-1.5 rounded-full bg-caution-line" />{t('common.simulated')}</span>;
}

export function TopBar({ title, right, back = true, onBack, className = '' }: { title?: ReactNode; right?: ReactNode; back?: boolean; onBack?: () => void; className?: string }) {
  const nav = useNavigate(); const { t } = useT();
  return (
    <header className={`flex min-h-[72px] items-center gap-2 px-3 pt-[max(1.75rem,env(safe-area-inset-top))] ${className}`}>
      {back ? <button className="grid h-11 w-11 place-items-center rounded-full text-text" aria-label={t('common.back')} onClick={onBack ?? (() => nav(-1))}><Icon name="back" /></button> : <span className="w-3" />}
      <h1 className="h-title flex-1 truncate text-text">{title}</h1>
      {right}
    </header>
  );
}

const reasonIcon: Record<Reason['tone'], { icon: string; cls: string }> = {
  good: { icon: 'check', cls: 'text-safe' }, warn: { icon: 'alert', cls: 'text-caution' }, bad: { icon: 'alert', cls: 'text-danger-text' }, info: { icon: 'help', cls: 'text-primary' },
};
const toneOrder = { bad: 0, warn: 1, good: 2, info: 3 } as const;
// eslint-disable-next-line react-refresh/only-export-components
export const sortReasons = (rs: Reason[]) => [...rs].sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone]);
// eslint-disable-next-line react-refresh/only-export-components
export function reasonText(t: ReturnType<typeof useT>['t'], r: Reason) { return t(`reason.${r.code}`, { count: r.count, pct: r.pct, meters: r.meters, name: r.name ?? '—' }); }

export function ReasonList({ reasons, max }: { reasons: Reason[]; max?: number }) {
  const { t } = useT();
  return (
    <ul className="space-y-2">
      {sortReasons(reasons).slice(0, max).map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px]">
          <Icon name={reasonIcon[r.tone].icon} size={17} className={`mt-0.5 shrink-0 ${reasonIcon[r.tone].cls}`} />
          <span>{reasonText(t, r)}</span>
        </li>
      ))}
    </ul>
  );
}

export function SosButton({ tripId, className = '' }: { tripId?: string; className?: string }) {
  const nav = useNavigate();
  return (
    <button aria-label="SOS" onClick={() => nav(`/sos${tripId ? `?trip=${tripId}` : ''}`)}
      className={`grid h-[72px] w-[72px] place-items-center rounded-full bg-danger text-xl font-bold text-on-primary shadow-float active:scale-95 ${className}`}>SOS</button>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useT();
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-card bg-danger-soft p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-danger-text"><Icon name="alert" size={18} />{message}</p>
      {onRetry && <button className="btn bg-surface text-sm" onClick={onRetry}>{t('common.retry')}</button>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) { return <div className={`animate-pulse rounded-card bg-surface-2 ${className}`} />; }

export function Toast({ children }: { children: ReactNode }) {
  return <div role="status" className="pointer-events-none fixed inset-x-4 bottom-28 z-[1000] mx-auto max-w-sm rounded-card bg-text px-4 py-3 text-center text-sm text-on-primary shadow-float">{children}</div>;
}

/** Switch from the Figma Home frame (59x28, ON/OFF text inside). */
export function Toggle({ on, onChange, label, text = true }: { on: boolean; onChange: (v: boolean) => void; label: string; text?: boolean }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={`relative h-7 w-[59px] shrink-0 rounded-[14px] transition ${on ? 'bg-primary' : 'bg-border'}`}>
      <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-surface shadow transition-all ${on ? 'left-[34px]' : 'left-[3px]'}`} />
      {text && <span className={`absolute top-[7px] text-[9px] font-bold leading-[14px] ${on ? 'left-[9px] text-on-primary' : 'left-[30px] text-text-2'}`}>{on ? 'ON' : 'OFF'}</span>}
    </button>
  );
}

/** Rounded-square hazard marker from the design (red = hazard, amber = construction/other). */
export function HazardBadge({ tone = 'danger', size = 32 }: { tone?: 'danger' | 'caution'; size?: number }) {
  return (
    <span className={`grid place-items-center rounded-[9px] ${tone === 'danger' ? 'bg-danger' : 'bg-caution-line'}`} style={{ width: size, height: size }}>
      <Icon name="alert" size={size * 0.62} className="text-text" />
    </span>
  );
}

export function BottomNav({ active }: { active: 'home' | 'report' | 'profile' }) {
  const nav = useNavigate(); const { t } = useT();
  const items = [
    { k: 'home', icon: 'home', label: t('nav.home'), to: '/map' },
    { k: 'report', icon: 'flag', label: t('nav.report'), to: '/report/new' },
    { k: 'profile', icon: 'user', label: t('nav.profile'), to: '/profile' },
  ] as const;
  return (
    <nav className="absolute inset-x-0 bottom-0 z-[700] flex h-[81px] items-start justify-around rounded-t-sheet bg-surface px-6 pt-3 pb-[env(safe-area-inset-bottom)] shadow-sheet">
      {items.map((i) => (
        <button key={i.k} onClick={() => nav(i.to)} aria-current={active === i.k ? 'page' : undefined}
          className={`flex min-h-12 items-center gap-2 px-3 text-xs ${active === i.k ? 'font-bold text-primary' : 'text-muted'}`}>
          <Icon name={i.icon} size={22} className={active === i.k ? 'text-primary' : 'text-text'} />{i.label}
        </button>
      ))}
    </nav>
  );
}
