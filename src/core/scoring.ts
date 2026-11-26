// Environmental scoring engine (rule-based, no AI). Score per road segment for departure time t.
//   lighting   30%  OSM lit tag (estimated by road type when missing) + street lamps, minus confirmed "dark" reports
//   facilities 25%  police, health, shops open at t (opening hours), bus stops, CCTV within POI_RADIUS_M
//   crowd      20%  road type x hour factor + open shops nearby + users' trip ratings
//   reports    25%  1 - penalty of confirmed community reports, decaying with a half-life
// segment score = 1 + 4 * Σ weight * factor  (1.0 - 5.0)
import {
  ACTIVITY_PER_OPEN_POI, CONFIRM_THRESHOLD, DARK_REPORT_LIGHT_PENALTY, HELP_SATURATION, HELP_WEIGHTS, HOUR_FACTOR, LIT_ESTIMATE, LIT_VALUE,
  MAX_COMMUNITY_PENALTY, POI_RADIUS_M, REPORT_HALF_LIFE_DAYS, REPORT_PENALTY, REPORT_SNAP_M, ROAD_ACTIVITY, SCORE_WEIGHTS, UNKNOWN_HOURS_FACTOR,
} from './config';
import { GridIndex, pointToPolyline, type Pt } from './geo';
import { isOpenAt } from './hours';
import type { Factors, Graph, GraphPoi, GraphSegment, Report } from './types';

export type SegmentRating = { segment_id: number; avg_rating: number; n: number; graph_version?: string };

export type Prepared = {
  graph: Graph;
  byId: Map<number, GraphSegment>;
  near: Map<number, GraphPoi[]>;            // POIs within POI_RADIUS_M of each segment
  segIndex: GridIndex<GraphSegment>;
  nodeIndex: GridIndex<number>;
  nodePos: Map<number, Pt>;
  adj: Map<number, { seg: GraphSegment; to: number }[]>;
  reports: Map<number, Report[]>;           // confirmed reports per segment
  ratings: Map<number, SegmentRating>;
};

/** Geospatial processing, once per graph (cached by caller). */
export function prepareGraph(graph: Graph): Prepared {
  const byId = new Map<number, GraphSegment>();
  const segIndex = new GridIndex<GraphSegment>(100);
  const nodeIndex = new GridIndex<number>(100);
  const nodePos = new Map<number, Pt>();
  const adj = new Map<number, { seg: GraphSegment; to: number }[]>();
  for (const n of graph.nodes) { nodePos.set(n.id, [n.lat, n.lng]); nodeIndex.insert([n.lat, n.lng], n.id); }
  for (const s of graph.segments) {
    byId.set(s.id, s);
    segIndex.insertLine(s.geometry, s);
    if (!adj.has(s.from)) adj.set(s.from, []);
    if (!adj.has(s.to)) adj.set(s.to, []);
    adj.get(s.from)!.push({ seg: s, to: s.to });
    adj.get(s.to)!.push({ seg: s, to: s.from });
  }
  const near = new Map<number, GraphPoi[]>();
  for (const s of graph.segments) near.set(s.id, []);
  for (const p of graph.pois) {
    const pt: Pt = [p.lat, p.lng];
    for (const s of segIndex.query(pt, POI_RADIUS_M)) {
      if (pointToPolyline(pt, s.geometry).d <= POI_RADIUS_M) near.get(s.id)!.push(p);
    }
  }
  return { graph, byId, near, segIndex, nodeIndex, nodePos, adj, reports: new Map(), ratings: new Map() };
}

/** Attach community data. Reports are matched by distance, so they survive graph rebuilds. */
export function applyCommunity(pg: Prepared, reports: Report[], ratings: SegmentRating[] = []) {
  pg.reports = new Map();
  for (const r of reports) {
    if (!(r.confirmed || r.confirm_count >= CONFIRM_THRESHOLD)) continue;
    const pt: Pt = [r.lat, r.lng];
    let best: GraphSegment | null = null, bestD = Infinity;
    for (const s of pg.segIndex.query(pt, REPORT_SNAP_M)) {
      const d = pointToPolyline(pt, s.geometry).d;
      if (d < bestD) { bestD = d; best = s; }
    }
    const seg = r.segment_id != null && pg.byId.has(r.segment_id) && bestD > REPORT_SNAP_M ? pg.byId.get(r.segment_id)! : bestD <= REPORT_SNAP_M ? best : null;
    if (!seg) continue;
    if (!pg.reports.has(seg.id)) pg.reports.set(seg.id, []);
    pg.reports.get(seg.id)!.push(r);
  }
  pg.ratings = new Map(ratings.filter((x) => x.n >= 2 && (!x.graph_version || x.graph_version === pg.graph.version)).map((x) => [x.segment_id, x]));
}

export function hourFactor(t: Date): number {
  const h = t.getHours() + t.getMinutes() / 60;
  for (const [a, b, f] of HOUR_FACTOR) if (h >= a && h < b) return f;
  return 0.5;
}

/** 1 if open, 0 if closed, UNKNOWN_HOURS_FACTOR if hours unknown. Police / CCTV / bus stops always count. */
export function openWeight(p: GraphPoi, t: Date): number {
  if (p.type === 'police' || p.type === 'cctv' || p.type === 'bus_stop' || p.type === 'streetlight') return 1;
  const o = isOpenAt(p.hours, t);
  return o === null ? UNKNOWN_HOURS_FACTOR : o ? 1 : 0;
}

export type SegmentScore = { factors: Factors; score: number; lit_estimated: boolean; open_places: number; police: number };

const decay = (r: Report, now: Date) => Math.pow(0.5, Math.max(0, (now.getTime() - new Date(r.created_at).getTime()) / 86_400_000) / REPORT_HALF_LIFE_DAYS);

export function scoreSegment(pg: Prepared, s: GraphSegment, t: Date, now = new Date()): SegmentScore {
  const near = pg.near.get(s.id) ?? [];
  const reports = pg.reports.get(s.id) ?? [];

  // lighting
  const lamps = near.filter((p) => p.type === 'streetlight').length;
  const litEstimated = s.lit === 'unknown';
  let lighting = litEstimated ? LIT_ESTIMATE[s.road_type] : LIT_VALUE[s.lit];
  lighting = Math.min(1, lighting + 0.1 * lamps);
  const darkReports = reports.filter((r) => r.category === 'dark' || r.category === 'broken_light').reduce((n, r) => n + decay(r, now), 0);
  lighting = Math.max(0, lighting - DARK_REPORT_LIGHT_PENALTY * darkReports);

  // facilities (access to help)
  let help = 0, openPlaces = 0, police = 0;
  for (const p of near) {
    const w = (HELP_WEIGHTS as Record<string, number>)[p.type];
    if (!w) continue;
    const ow = openWeight(p, t);
    help += w * ow;
    if ((p.type === 'shop' || p.type === 'shop24' || p.type === 'health') && ow === 1) openPlaces++;
    if (p.type === 'police') police++;
  }
  const facilities = Math.min(1, help / HELP_SATURATION);

  // crowd (potential activity)
  const openShops = near.filter((p) => (p.type === 'shop' || p.type === 'shop24')).reduce((n, p) => n + openWeight(p, t), 0);
  let crowd = Math.min(1, ROAD_ACTIVITY[s.road_type] * hourFactor(t) + ACTIVITY_PER_OPEN_POI * openShops);
  const rating = pg.ratings.get(s.id);
  if (rating) crowd = 0.8 * crowd + 0.2 * ((rating.avg_rating - 1) / 4);

  // community reports
  const penalty = Math.min(MAX_COMMUNITY_PENALTY, reports.reduce((n, r) => n + (REPORT_PENALTY[r.category] ?? 0.1) * decay(r, now), 0));
  const reportsF = 1 - penalty; // contract: reports = 1 - community_penalty

  const W = SCORE_WEIGHTS;
  const final = W.lighting * lighting + W.facilities * facilities + W.crowd * crowd + W.reports * reportsF;
  return {
    factors: { lighting, facilities, crowd, reports: reportsF, community_penalty: penalty },
    score: Math.round((1 + 4 * final) * 10) / 10,
    lit_estimated: litEstimated, open_places: openPlaces, police,
  };
}

/** Score cache for one departure time (Dijkstra asks for the same segments many times). */
export function scorer(pg: Prepared, t: Date, now = new Date()) {
  const cache = new Map<number, SegmentScore>();
  return (s: GraphSegment) => { let v = cache.get(s.id); if (!v) { v = scoreSegment(pg, s, t, now); cache.set(s.id, v); } return v; };
}
