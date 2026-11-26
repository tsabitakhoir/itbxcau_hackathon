import { useEffect, useRef } from 'react';

const ITEM = 40; // px per row
const pad = (n: number) => String(n).padStart(2, '0');

function Column({ count, value, onChange, label }: { count: number; value: number; onChange: (v: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  // Scroll to the value from outside (first render, or a chip was tapped).
  useEffect(() => { const el = ref.current; if (el && Math.round(el.scrollTop / ITEM) !== value) el.scrollTo({ top: value * ITEM }); }, [value]);
  const onScroll = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { const el = ref.current; if (!el) return; const i = Math.max(0, Math.min(count - 1, Math.round(el.scrollTop / ITEM))); if (i !== value) onChange(i); }, 90);
  };
  return (
    <div ref={ref} onScroll={onScroll} role="listbox" aria-label={label} tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.min(count - 1, value + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.max(0, value - 1)); } }}
      className="relative h-[200px] w-20 snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ paddingBlock: ITEM * 2 }}>
      {Array.from({ length: count }, (_, i) => (
        <button key={i} type="button" role="option" aria-selected={i === value} onClick={() => onChange(i)}
          className={`block h-10 w-full snap-center text-center text-[22px] tabular-nums transition ${i === value ? 'font-bold text-text' : 'text-muted/60'}`}>{pad(i)}</button>
      ))}
    </div>
  );
}

/** iOS-style scroll wheel for hour and minute (24 h). */
export function TimeWheel({ hour, minute, onHour, onMinute, labels }: { hour: number; minute: number; onHour: (h: number) => void; onMinute: (m: number) => void; labels: { hour: string; minute: string } }) {
  return (
    <div className="relative flex items-center justify-center gap-2 rounded-[18px] bg-surface-2 py-2">
      <div className="pointer-events-none absolute inset-x-4 top-1/2 h-10 -translate-y-1/2 rounded-xl bg-surface" />
      <div className="relative"><Column count={24} value={hour} onChange={onHour} label={labels.hour} /></div>
      <span className="relative text-[22px] font-bold text-text">:</span>
      <div className="relative"><Column count={60} value={minute} onChange={onMinute} label={labels.minute} /></div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 rounded-t-[18px] bg-gradient-to-b from-surface-2 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-[18px] bg-gradient-to-t from-surface-2 to-transparent" />
    </div>
  );
}
