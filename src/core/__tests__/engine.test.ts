import { describe, expect, it } from 'vitest';
import { MAX_DETOUR_RATIO } from '../config';
import { isOpenAt } from '../hours';
import { buildGraph, type OsmElement } from '../osm';
import { planOnGraph } from '../planner';
import { applyCommunity, prepareGraph, scoreSegment } from '../scoring';
import { activityHeatmap } from '../heatmap';
import type { Report } from '../types';

// Synthetic OSM area (~ITB scale). A -> B either through a short dark alley (diagonal) or along a lit main road (L shape).
//   N3 ---- N4 (B)
//   |      /
//   |   alley (no light, steps in the middle)
//   |   /
//   N1 (A) ---- N2
const D = 0.001; // ~111 m
const base = { lat: -6.89, lng: 107.61 };
const P = (i: number, j: number) => ({ lat: base.lat + i * D, lon: base.lng + j * D });
let nid = 1;
const nodes = new Map<string, number>();
const node = (i: number, j: number) => { const k = `${i},${j}`; if (!nodes.has(k)) nodes.set(k, nid++); return nodes.get(k)!; };
function way(id: number, pts: [number, number][], tags: Record<string, string>): OsmElement {
  return { type: 'way', id, nodes: pts.map(([i, j]) => node(i, j)), geometry: pts.map(([i, j]) => P(i, j)), tags };
}
const elements: OsmElement[] = [
  // main road: A(0,0) -> (0,4) -> (4,4)=B ... and A -> (4,0) -> B
  way(10, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], { highway: 'primary', name: 'Jl. Utama', lit: 'yes' }),
  way(11, [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4]], { highway: 'primary', name: 'Jl. Utama', lit: 'yes' }),
  // alley: diagonal A -> B, shorter (4*1.41=5.6 vs 8 units)
  way(20, [[0, 0], [1, 1], [2, 2]], { highway: 'residential', name: 'Gg. Gelap', lit: 'no' }),
  way(21, [[2, 2], [2.5, 2.5]], { highway: 'steps', name: 'Gg. Gelap', lit: 'no' }),
  way(22, [[2.5, 2.5], [3, 3], [4, 4]], { highway: 'residential', name: 'Gg. Gelap', lit: 'no' }),
  // step-free detour around the steps
  way(23, [[2, 2], [2, 3], [3, 3]], { highway: 'residential', name: 'Gg. Landai', lit: 'no' }),
  // isolated piece that must be dropped
  way(30, [[10, 10], [11, 10]], { highway: 'residential' }),
  // POIs
  { type: 'node', id: 9001, lat: base.lat + 4 * D + 0.0002, lon: base.lng + 2 * D, tags: { amenity: 'police', name: 'Pos Polisi' } },
  { type: 'node', id: 9002, lat: base.lat + 2 * D, lon: base.lng + 0.0003, tags: { shop: 'convenience', name: 'Indomaret', opening_hours: '24/7' } },
  { type: 'node', id: 9003, lat: base.lat + 1 * D + 0.0002, lon: base.lng + 1 * D, tags: { shop: 'clothes', name: 'Toko', opening_hours: '09:00-21:00' } },
];
const graph = buildGraph(elements, { version: 'test-1', city: 'test', bbox: [base.lat - 0.01, base.lng - 0.01, base.lat + 0.02, base.lng + 0.02] });
const A = { lat: base.lat, lng: base.lng }, B = { lat: base.lat + 4 * D, lng: base.lng + 4 * D };
const night = new Date('2026-11-26T22:30:00');

describe('osm graph builder', () => {
  it('splits ways at junctions and drops disconnected parts', () => {
    expect(graph.segments.length).toBeGreaterThan(5);
    expect(graph.segments.every((s) => s.name !== null || s.road_type)).toBe(true);
    expect(graph.nodes.find((n) => Math.abs(n.lat - (base.lat + 10 * D)) < 1e-9)).toBeUndefined();
    expect(graph.segments.find((s) => s.access?.steps)).toBeDefined();
    expect(graph.segments.find((s) => s.name === 'Gg. Gelap')!.road_type).toBe('alley');
    expect(graph.pois.map((p) => p.type).sort()).toEqual(['police', 'shop', 'shop24']);
  });
});

describe('opening hours', () => {
  it('handles 24/7, past-midnight ranges, weekdays and unknown', () => {
    expect(isOpenAt('24/7', night)).toBe(true);
    expect(isOpenAt('18:00-02:00', new Date('2026-11-27T01:00:00'))).toBe(true);
    expect(isOpenAt('09:00-21:00', night)).toBe(false);
    expect(isOpenAt('Mo-Fr 08:00-17:00; Sa 08:00-12:00', new Date('2026-11-28T10:00:00'))).toBe(true); // Saturday
    expect(isOpenAt('Mo-Fr 08:00-17:00; Su off', new Date('2026-11-29T10:00:00'))).toBe(false); // Sunday
    expect(isOpenAt(null, night)).toBeNull();
    expect(isOpenAt('sunrise-sunset', night)).toBeNull();
  });
});

describe('scoring', () => {
  const pg = prepareGraph(graph);
  const main = graph.segments.find((s) => s.name === 'Jl. Utama')!;
  const alley = graph.segments.find((s) => s.name === 'Gg. Gelap' && !s.access?.steps)!;
  it('lit main road scores higher than a dark alley', () => {
    expect(scoreSegment(pg, main, night).score).toBeGreaterThan(scoreSegment(pg, alley, night).score);
    expect(scoreSegment(pg, alley, night).factors.lighting).toBeLessThan(0.3);
  });
  it('closed shops do not count at departure time', () => {
    const shopSeg = graph.segments.find((s) => pg.near.get(s.id)!.some((p) => p.name === 'Toko'))!;
    const day = scoreSegment(pg, shopSeg, new Date('2026-11-26T12:00:00')).open_places;
    const late = scoreSegment(pg, shopSeg, night).open_places;
    expect(day).toBeGreaterThan(late);
  });
  it('only confirmed reports change the score, and they decay', () => {
    const now = new Date('2026-11-26T22:00:00');
    const r = (confirmed: boolean, daysAgo = 0): Report => ({ id: `r${confirmed}${daysAgo}`, lat: main.geometry[0][0], lng: main.geometry[0][1], segment_id: null, category: 'harassment', note: null, photo_url: null, created_at: new Date(now.getTime() - daysAgo * 86400e3).toISOString(), confirm_count: confirmed ? 3 : 1, confirmed, is_mine: false, confirmed_by_me: false, simulated: true });
    const before = scoreSegment(pg, main, night, now).score;
    applyCommunity(pg, [r(false)]);
    expect(scoreSegment(pg, main, night, now).score).toBe(before);
    applyCommunity(pg, [r(true)]);
    const fresh = scoreSegment(pg, main, night, now).score;
    expect(fresh).toBeLessThan(before);
    applyCommunity(pg, [r(true, 60)]);
    expect(scoreSegment(pg, main, night, now).score).toBeGreaterThan(fresh);
    applyCommunity(pg, []);
  });
});

describe('planner', () => {
  const pg = prepareGraph(graph);
  it('fastest takes the alley, safest the lit main road within the detour limit', () => {
    const plan = planOnGraph(pg, { origin: A, destination: B, departure_at: night, now: new Date('2026-11-26T20:00:00') });
    expect(plan.fastest.length_m).toBeLessThan(plan.safest.length_m);
    expect(plan.safest.score).toBeGreaterThan(plan.fastest.score);
    expect(plan.safest.length_m).toBeLessThanOrEqual(MAX_DETOUR_RATIO * plan.fastest.length_m + 40);
    expect(plan.same_route).toBe(false);
    expect(plan.fastest.reasons.some((r) => r.code === 'DARK_STRETCH')).toBe(true);
    expect(plan.safest.reasons.find((r) => r.code === 'LIT_PCT')!.pct).toBe(100);
    expect(plan.fastest.watch_areas!.some((w) => w.kind === 'dark')).toBe(true);
    expect(plan.safest.steps![0].maneuver).toBe('depart');
    expect(plan.safest.steps!.some((s) => s.maneuver === 'left' || s.maneuver === 'right')).toBe(true);
    expect(plan.safest.steps!.at(-1)!.maneuver).toBe('arrive');
    expect(plan.safest.score_later).toBeTruthy();
    expect(plan.fastest.geometry[0]).toEqual([A.lat, A.lng]);
  });
  it('wheelchair mode never uses steps when a step-free path exists', () => {
    const walk = planOnGraph(pg, { origin: A, destination: B, departure_at: night, now: night });
    const wc = planOnGraph(pg, { origin: A, destination: B, departure_at: night, mode: 'wheelchair', now: night });
    expect(walk.fastest.access!.steps).toBe(1);
    expect(wc.fastest.access!.steps).toBe(0);
    expect(wc.fastest.access!.wheelchair_ok).toBe(true);
    expect(wc.mode).toBe('wheelchair');
    expect(wc.fastest.duration_s).toBeGreaterThan(wc.fastest.length_m / 1.25);
  });
  it('rejects points outside the graph', () => {
    expect(() => planOnGraph(pg, { origin: A, destination: { lat: base.lat + 0.1, lng: base.lng }, departure_at: night })).toThrowError(/outside/);
  });
  it('heatmap returns crowd intensities 0..1', () => {
    const h = activityHeatmap(pg, night);
    expect(h.length).toBeGreaterThan(10);
    expect(h.every(([, , v]) => v >= 0 && v <= 1)).toBe(true);
  });
});
