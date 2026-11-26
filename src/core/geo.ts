// Pure geometry helpers (equirectangular approximation, accurate enough at city scale).
import type { LatLng } from './types';

export type Pt = [number, number]; // [lat, lng]
const R = 6371000;
const RAD = Math.PI / 180;

export function dist(a: Pt, b: Pt): number {
  const x = (b[1] - a[1]) * RAD * Math.cos(((a[0] + b[0]) / 2) * RAD);
  const y = (b[0] - a[0]) * RAD;
  return Math.hypot(x, y) * R;
}
export const distLL = (a: LatLng, b: LatLng) => dist([a.lat, a.lng], [b.lat, b.lng]);

export function polylineLength(g: Pt[]): number {
  let s = 0;
  for (let i = 1; i < g.length; i++) s += dist(g[i - 1], g[i]);
  return s;
}

/** Distance from point p to segment a-b plus the closest point and its fraction t along a-b. */
export function pointToSegment(p: Pt, a: Pt, b: Pt): { d: number; t: number; q: Pt } {
  const k = Math.cos(p[0] * RAD);
  const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = p[1] * k, py = p[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const q: Pt = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { d: dist(p, q), t, q };
}

/** Distance from p to a polyline; also returns the distance along the line to the closest point. */
export function pointToPolyline(p: Pt, g: Pt[]): { d: number; along: number; q: Pt } {
  let best = { d: Infinity, along: 0, q: g[0] };
  let acc = 0;
  for (let i = 1; i < g.length; i++) {
    const seg = dist(g[i - 1], g[i]);
    const r = pointToSegment(p, g[i - 1], g[i]);
    if (r.d < best.d) best = { d: r.d, along: acc + seg * r.t, q: r.q };
    acc += seg;
  }
  if (g.length === 1) best = { d: dist(p, g[0]), along: 0, q: g[0] };
  return best;
}

/** Points every `step` metres along a polyline (including the first point). */
export function sampleAlong(g: Pt[], step: number): Pt[] {
  if (g.length === 0) return [];
  const out: Pt[] = [g[0]];
  let carry = 0;
  for (let i = 1; i < g.length; i++) {
    const a = g[i - 1], b = g[i];
    const seg = dist(a, b);
    let pos = step - carry;
    while (pos <= seg) {
      const t = pos / seg;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      pos += step;
    }
    carry = seg - (pos - step);
  }
  return out;
}

/** Initial bearing a->b in degrees (0 = north, clockwise). */
export function bearing(a: Pt, b: Pt): number {
  const y = (b[1] - a[1]) * Math.cos(((a[0] + b[0]) / 2) * RAD);
  const x = b[0] - a[0];
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** Signed turn angle from bearing b1 to b2 in (-180, 180]; positive = right. */
export function turnAngle(b1: number, b2: number): number {
  let d = b2 - b1;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

export function bboxOf(points: Pt[], padM = 0): [number, number, number, number] {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const [lat, lng] of points) { s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lng); e = Math.max(e, lng); }
  const dLat = padM / 111_320;
  const dLng = padM / (111_320 * Math.cos(((s + n) / 2) * RAD));
  return [s - dLat, w - dLng, n + dLat, e + dLng];
}

export const inBbox = (p: Pt, b: [number, number, number, number]) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];

/** Simple uniform grid for fast "what is near this point" lookups. */
export class GridIndex<T> {
  private cells = new Map<number, T[]>();
  private readonly cellDeg: number;
  constructor(cellM = 100) { this.cellDeg = cellM / 111_320; }
  // numeric cell key (i, j fit easily: |lat|/cell < 1e5 for cells >= 1 m)
  private key(lat: number, lng: number) { return this.k(Math.floor(lat / this.cellDeg), Math.floor(lng / this.cellDeg)); }
  private k(i: number, j: number) { return (i + 2_000_000) * 4_000_000 + (j + 2_000_000); }
  insert(p: Pt, item: T) { const k = this.key(p[0], p[1]); const c = this.cells.get(k); if (c) c.push(item); else this.cells.set(k, [item]); }
  /** Insert an item for every cell its polyline crosses (approximate: samples every half cell). */
  insertLine(g: Pt[], item: T) {
    const seen = new Set<number>();
    for (const p of sampleAlong(g, this.cellDeg * 111_320 * 0.5).concat([g[g.length - 1]])) {
      const k = this.key(p[0], p[1]);
      if (seen.has(k)) continue;
      seen.add(k);
      const c = this.cells.get(k); if (c) c.push(item); else this.cells.set(k, [item]);
    }
  }
  /** Items in cells within radiusM of p (caller filters by exact distance). */
  query(p: Pt, radiusM: number): T[] {
    const r = Math.ceil(radiusM / (this.cellDeg * 111_320)) + 1;
    const ci = Math.floor(p[0] / this.cellDeg), cj = Math.floor(p[1] / this.cellDeg);
    const out = new Set<T>();
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const c = this.cells.get(this.k(i, j));
      if (c) for (const x of c) out.add(x);
    }
    return [...out];
  }
}
