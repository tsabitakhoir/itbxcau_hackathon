// 24px stroke icons (placeholder set until the Figma icons are exported).
const P: Record<string, string> = {
  back: 'M15 18l-6-6 6-6',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  pin: 'M12 22s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12zM12 12a2 2 0 100-4 2 2 0 000 4z',
  dot: 'M12 15a3 3 0 100-6 3 3 0 000 6z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  share: 'M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6L6 18',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  people: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M17 11a3 3 0 100-6M22 21a6 6 0 00-4-5.6',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v4M12 16h.01',
  alert: 'M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01',
  phone: 'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z',
  camera: 'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z',
  id: 'M3 5h18v14H3zM7 15a2 2 0 114 0M9 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM14 9h4M14 13h4',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  home: 'M3 10l9-7 9 7v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  locate: 'M12 19a7 7 0 100-14 7 7 0 000 14zM12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M2 12h3M19 12h3',
  swap: 'M7 4v16M7 4L3 8M7 4l4 4M17 20V4M17 20l-4-4M17 20l4-4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  turn: 'M6 20v-8a4 4 0 014-4h9M15 4l4 4-4 4',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
  chev: 'M9 6l6 6-6 6',
  chevDown: 'M6 9l6 6 6-6',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  walk: 'M13 4a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM9 22l2.5-7M14 22l-1-5-2.5-3 1-5M7 12l3-4 3.5 1 2.5 4',
  wheelchair: 'M11 4a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM11 6v7h6l2 6M11 9h5M8 10.5a6 6 0 108.5 7.5',
  volume: 'M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14',
  right: 'M7 19V11a4 4 0 014-4h8M15 3l4 4-4 4',
  left: 'M17 19V11a4 4 0 00-4-4H5M9 3L5 7l4 4',
  up: 'M12 20V4M6 10l6-6 6 6',
};
export function Icon({ name, size = 24, className = '', filled = false }: { name: keyof typeof P | string; size?: number; className?: string; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={P[name] ?? P.dot} />
    </svg>
  );
}
