// Route optimization: Weighted Dijkstra (binary heap) on the undirected road graph.
// Origin/destination are snapped onto the nearest segment (not just the nearest node), so short trips work too.
import { SNAP_MAX_M } from './config';
import { dist, pointToPolyline, type Pt } from './geo';
import type { Prepared } from './scoring';
import type { GraphSegment } from './types';

/** One traversed piece of a segment, from `a` to `b` metres along its geometry (a > b means walked backwards). */
export type Leg = { seg: GraphSegment; a: number; b: number };
export type Snap = { seg: GraphSegment; along: number; d: number; q: Pt };
export type CostFn = (seg: GraphSegment, meters: number) => number; // Infinity = blocked

export function snap(pg: Prepared, p: Pt, maxM = SNAP_MAX_M): Snap | null {
  let best: Snap | null = null;
  for (const r of [60, 150, maxM]) {
    for (const s of pg.segIndex.query(p, r)) {
      const x = pointToPolyline(p, s.geometry);
      if (!best || x.d < best.d) best = { seg: s, along: x.along, d: x.d, q: x.q };
    }
    if (best && best.d <= r) break;
  }
  return best && best.d <= maxM ? best : null;
}

class Heap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v; k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  }
  pop(): [number, number] {
    const k = this.k, v = this.v; const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk; v[0] = lv; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return top;
  }
}

const START = -1, END = -2;

/** Cheapest path from snap o to snap d. Returns legs in walking order, or null when unreachable. */
export function dijkstra(pg: Prepared, o: Snap, d: Snap, cost: CostFn): Leg[] | null {
  type Edge = { to: number; leg: Leg; c: number };
  const virt = new Map<number, Edge[]>();
  const addV = (from: number, e: Edge) => { if (!isFinite(e.c)) return; if (!virt.has(from)) virt.set(from, []); virt.get(from)!.push(e); };
  const L = (s: GraphSegment) => s.length_m;
  // START -> ends of its segment
  addV(START, { to: o.seg.from, leg: { seg: o.seg, a: o.along, b: 0 }, c: cost(o.seg, o.along) });
  addV(START, { to: o.seg.to, leg: { seg: o.seg, a: o.along, b: L(o.seg) }, c: cost(o.seg, L(o.seg) - o.along) });
  // ends of destination segment -> END
  addV(d.seg.from, { to: END, leg: { seg: d.seg, a: 0, b: d.along }, c: cost(d.seg, d.along) });
  addV(d.seg.to, { to: END, leg: { seg: d.seg, a: L(d.seg), b: d.along }, c: cost(d.seg, L(d.seg) - d.along) });
  if (o.seg.id === d.seg.id) addV(START, { to: END, leg: { seg: o.seg, a: o.along, b: d.along }, c: cost(o.seg, Math.abs(d.along - o.along)) });

  const best = new Map<number, number>([[START, 0]]);
  const prev = new Map<number, { from: number; leg: Leg }>();
  const heap = new Heap();
  heap.push(0, START);
  const done = new Set<number>();
  while (heap.size) {
    const [c, u] = heap.pop();
    if (done.has(u)) continue;
    done.add(u);
    if (u === END) break;
    const edges: Edge[] = [];
    for (const e of virt.get(u) ?? []) edges.push(e);
    if (u !== START) for (const { seg, to } of pg.adj.get(u) ?? []) {
      const c2 = cost(seg, seg.length_m);
      if (!isFinite(c2)) continue;
      edges.push({ to, leg: seg.from === u ? { seg, a: 0, b: seg.length_m } : { seg, a: seg.length_m, b: 0 }, c: c2 });
    }
    for (const e of edges) {
      const nc = c + e.c;
      if (nc < (best.get(e.to) ?? Infinity)) { best.set(e.to, nc); prev.set(e.to, { from: u, leg: e.leg }); heap.push(nc, e.to); }
    }
  }
  if (!done.has(END)) return null;
  const legs: Leg[] = [];
  for (let n = END; n !== START;) { const p = prev.get(n)!; legs.push(p.leg); n = p.from; }
  return legs.reverse().filter((l) => Math.abs(l.b - l.a) > 0.01);
}

/** Geometry of a leg (sub-polyline from a to b metres along the segment). */
export function legGeometry(leg: Leg): Pt[] {
  const g = leg.seg.geometry;
  const lo = Math.min(leg.a, leg.b), hi = Math.max(leg.a, leg.b);
  const out: Pt[] = [];
  let acc = 0;
  const at = (i: number, t: number): Pt => [g[i - 1][0] + (g[i][0] - g[i - 1][0]) * t, g[i - 1][1] + (g[i][1] - g[i - 1][1]) * t];
  for (let i = 1; i < g.length; i++) {
    const len = dist(g[i - 1], g[i]);
    const s0 = acc, s1 = acc + len;
    if (s1 >= lo && s0 <= hi && len > 0) {
      if (!out.length) out.push(at(i, Math.max(0, (lo - s0) / len)));
      out.push(at(i, Math.min(1, (hi - s0) / len)));
    }
    acc = s1;
  }
  if (!out.length) out.push(g[0]);
  return leg.a > leg.b ? out.reverse() : out;
}

export const legLength = (l: Leg) => Math.abs(l.b - l.a);
