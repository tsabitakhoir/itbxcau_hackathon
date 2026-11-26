import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../i18n';

/**
 * Bottom sheet over a full-screen map. Drag the grey handle down to collapse it
 * (only `peek` px stays visible) so the map is not covered; drag up or tap to expand.
 * `above` floats just above the sheet's top edge and moves with it (e.g. locate button).
 */
export function Sheet({ children, peek = 96, above, onCollapsedChange, className = '' }: {
  children: ReactNode; peek?: number; above?: ReactNode; onCollapsedChange?: (c: boolean) => void; className?: string;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; t: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setH(el.offsetHeight)); ro.observe(el); setH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { onCollapsedChange?.(collapsed); }, [collapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxOffset = Math.max(0, h - peek);
  const base = collapsed ? maxOffset : 0;
  const offset = drag == null ? base : Math.min(maxOffset, Math.max(0, base + drag));

  const onDown = (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); start.current = { y: e.clientY, t: Date.now(), moved: false }; setDrag(0); };
  const onMove = (e: React.PointerEvent) => { if (!start.current) return; const dy = e.clientY - start.current.y; if (Math.abs(dy) > 4) start.current.moved = true; setDrag(dy); };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current; start.current = null; setDrag(null); if (!s) return;
    const dy = e.clientY - s.y; const v = dy / Math.max(1, Date.now() - s.t); // px per ms
    if (!s.moved) { setCollapsed((c) => !c); return; }
    if (dy > 0 && (v > 0.3 || dy > 60)) setCollapsed(true);
    else if (dy < 0 && (v < -0.3 || -dy > 60)) setCollapsed(false);
  };

  return (
    <div ref={ref} className={`sheet absolute inset-x-0 bottom-0 z-[600] ${className}`}
      style={{ transform: `translateY(${offset}px)`, transition: drag == null ? 'transform .25s ease' : 'none' }}>
      {above && <div className="pointer-events-none absolute inset-x-0 bottom-full"><div className="pointer-events-auto">{above}</div></div>}
      <button type="button" aria-expanded={!collapsed} aria-label={t(collapsed ? 'sheet.expand' : 'sheet.collapse')}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { start.current = null; setDrag(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed((c) => !c); } }}
        className="flex h-7 w-full cursor-grab touch-none items-center justify-center active:cursor-grabbing">
        <span className="sheet-handle" />
      </button>
      {children}
    </div>
  );
}
