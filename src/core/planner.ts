// planRoutes over a prepared graph: fastest (distance only) vs safest (distance + safety penalty), per travel mode.
import { MAX_DETOUR_RATIO, SAFETY_ALPHA, SCORE_BANDS, WALK_SPEED_MPS, WHEELCHAIR } from './config';
import { isOpenAt } from './hours';
import { bearing, dist, pointToPolyline, turnAngle, type Pt } from './geo';
import { dijkstra, legGeometry, legLength, snap, type CostFn, type Leg } from './routing';
import { scorer, type Prepared, type SegmentScore } from './scoring';
import {
  ApiError, type AccessInfo, type Factors, type GraphSegment, type LatLng, type Maneuver, type NavStep, type PlanResult, type Reason,
  type RouteKind, type RouteOption, type TravelMode, type WatchArea,
} from './types';

export type PlanInput = { origin: LatLng; destination: LatLng; departure_at: Date; mode?: TravelMode; now?: Date };

/** Wheelchair: why a segment is a problem (null = fine). */
export function wheelchairIssue(s: GraphSegment): 'steps' | 'steep' | 'surface' | 'narrow' | 'tagged_no' | null {
  const a = s.access;
  if (!a) return null;
  if (a.steps) return 'steps';
  if (a.wheelchair === 'no') return 'tagged_no';
  if (a.incline_pct !== undefined && a.incline_pct > WHEELCHAIR.steep_incline_pct) return 'steep';
  if ((a.surface && WHEELCHAIR.bad_surfaces.includes(a.surface)) || (a.smoothness && WHEELCHAIR.bad_smoothness.includes(a.smoothness))) return 'surface';
  if (a.width_m !== undefined && a.width_m < WHEELCHAIR.narrow_width_m) return 'narrow';
  return null;
}

const speedOf = (mode: TravelMode) => (mode === 'wheelchair' ? WHEELCHAIR.speed_mps : WALK_SPEED_MPS);

function routeCost(mode: TravelMode, strict: boolean, safety: null | { alpha: number; score: (s: GraphSegment) => SegmentScore }): CostFn {
  return (s, m) => {
    let c = m;
    const issue = mode === 'wheelchair' ? wheelchairIssue(s) : null;
    if (issue === 'narrow') c *= 2;              // soft: narrow sidewalk
    else if (issue) {
      if (strict) return Infinity;               // hard: steps, steep incline, bad surface, wheelchair=no
      c *= WHEELCHAIR.fallback_penalty;          // fallback when no route without them exists
    }
    if (safety) c *= 1 + (safety.alpha * (5 - safety.score(s).score)) / 4;
    return c;
  };
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const TONE_ORDER = { bad: 0, warn: 1, good: 2, info: 3 } as const;

function legScoreAt(legs: Leg[], score: (s: GraphSegment) => SegmentScore): number {
  let w = 0, total = 0;
  for (const l of legs) { const m = legLength(l); w += m; total += m * score(l.seg).score; }
  return w ? r1(total / w) : 1;
}

function maneuverOf(angle: number): Maneuver {
  const a = Math.abs(angle);
  if (a < 25) return 'straight';
  const side = angle > 0 ? 'right' : 'left';
  if (a < 50) return `slight_${side}` as Maneuver;
  if (a < 135) return side as Maneuver;
  return `sharp_${side}` as Maneuver;
}

function buildSteps(legs: Leg[], geoms: Pt[][]): NavStep[] {
  const steps: NavStep[] = [];
  let cur: NavStep | null = null;
  for (let i = 0; i < legs.length; i++) {
    const g = geoms[i], m = legLength(legs[i]), name = legs[i].seg.name;
    if (!cur) { cur = { maneuver: 'depart', name, distance_m: m, at: g[0] }; continue; }
    const pg = geoms[i - 1];
    const b1 = bearing(pg[Math.max(0, pg.length - 2)], pg[pg.length - 1]);
    const b2 = bearing(g[0], g[Math.min(1, g.length - 1)]);
    const man = maneuverOf(turnAngle(b1, b2));
    if (man === 'straight' && (name === cur.name || name == null || cur.name == null)) { cur.distance_m += m; if (!cur.name) cur.name = name; continue; }
    if (man !== 'straight' && m < 8) { cur.distance_m += m; continue; } // tiny connector pieces / last few metres
    steps.push(cur);
    cur = { maneuver: man, name, distance_m: m, at: g[0] };
  }
  if (cur) steps.push(cur);
  const last = geoms[geoms.length - 1];
  steps.push({ maneuver: 'arrive', name: null, distance_m: 0, at: last[last.length - 1] });
  return steps.map((s) => ({ ...s, distance_m: Math.round(s.distance_m) }));
}

function buildOption(kind: RouteKind, mode: TravelMode, legs: Leg[], pg: Prepared, o: Pt, d: Pt, t: Date, now: Date, score: (s: GraphSegment) => SegmentScore, wheelchairOk: boolean): RouteOption {
  const geoms = legs.map(legGeometry);
  const geometry: Pt[] = [o];
  for (const g of geoms) for (const p of g) { const last = geometry[geometry.length - 1]; if (dist(last, p) > 0.3) geometry.push(p); }
  if (dist(geometry[geometry.length - 1], d) > 0.3) geometry.push(d);

  const graphLen = legs.reduce((n, l) => n + legLength(l), 0);
  const length = graphLen + dist(o, geometry[1] ?? o) + dist(geometry[geometry.length - 2] ?? d, d);
  const f: Factors = { lighting: 0, facilities: 0, crowd: 0, reports: 0, community_penalty: 0 };
  let total = 0, litGood = 0, busy = 0, unknownLit = 0;
  const open = new Set<number>(), police = new Set<number>(), toilets = new Set<number>(), kerbs = new Set<number>();
  const reportIds = new Set<string>();
  const access: AccessInfo & { rough_m: number } = { steps: 0, steep_m: 0, narrow_m: 0, rough_m: 0, lowered_kerbs: 0, accessible_toilets: 0, wheelchair_ok: true };
  type Run = { kind: WatchArea['kind']; legs: Leg[]; m: number };
  const watch: Run[] = [];
  let darkRun: Run | null = null, quietRun: Run | null = null;
  let worst: { id: number; name: string | null; score: number } | null = null;
  const seenSeg = new Set<number>();

  for (const l of legs) {
    const s = l.seg, m = legLength(l), sc = score(s);
    total += m * sc.score;
    for (const k of ['lighting', 'facilities', 'crowd', 'reports', 'community_penalty'] as const) f[k] += m * sc.factors[k];
    if (sc.factors.lighting >= 0.6) litGood += m;
    if (sc.factors.crowd >= 0.6) busy += m;
    if (sc.lit_estimated) unknownLit += m;
    if (!worst || sc.score < worst.score) worst = { id: s.id, name: s.name, score: sc.score };
    for (const p of pg.near.get(s.id) ?? []) {
      if (p.type === 'police') police.add(p.id);
      if (p.type === 'toilet_accessible') toilets.add(p.id);
      if (p.type === 'kerb_lowered') kerbs.add(p.id);
    }
    for (const r of pg.reports.get(s.id) ?? []) reportIds.add(r.id);
    if (!seenSeg.has(s.id)) {
      seenSeg.add(s.id);
      // count each open place once per route
      for (const p of pg.near.get(s.id) ?? []) if ((p.type === 'shop' || p.type === 'shop24' || p.type === 'health') && isOpenFull(p, t)) open.add(p.id);
    }
    const issue = wheelchairIssue(s);
    if (issue === 'steps') access.steps++;
    if (issue === 'steep') access.steep_m += m;
    if (issue === 'narrow') access.narrow_m += m;
    if (issue === 'surface') access.rough_m += m;
    if (mode === 'wheelchair' && issue) watch.push({ kind: issue === 'steps' ? 'steps' : issue === 'steep' ? 'steep' : 'narrow', legs: [l], m });
    if (pg.reports.get(s.id)?.length) watch.push({ kind: 'report', legs: [l], m });
    // contiguous dark / quiet stretches
    if (sc.factors.lighting < 0.5) { if (darkRun) { darkRun.legs.push(l); darkRun.m += m; } else darkRun = { kind: 'dark', legs: [l], m }; }
    else if (darkRun) { if (darkRun.m >= 50) watch.push(darkRun); darkRun = null; }
    if (sc.factors.crowd < 0.3) { if (quietRun) { quietRun.legs.push(l); quietRun.m += m; } else quietRun = { kind: 'quiet', legs: [l], m }; }
    else if (quietRun) { if (quietRun.m >= 50) watch.push(quietRun); quietRun = null; }
  }
  if (darkRun && darkRun.m >= 50) watch.push(darkRun);
  if (quietRun && quietRun.m >= 50) watch.push(quietRun);
  access.lowered_kerbs = kerbs.size;
  access.accessible_toilets = toilets.size;
  access.wheelchair_ok = (mode !== 'wheelchair' || wheelchairOk) && access.steps === 0 && access.steep_m === 0 && access.rough_m === 0;
  access.steep_m = Math.round(access.steep_m); access.narrow_m = Math.round(access.narrow_m); access.rough_m = Math.round(access.rough_m);

  const w = Math.max(graphLen, 1);
  for (const k of Object.keys(f) as (keyof Factors)[]) f[k] = Math.round((f[k] / w) * 100) / 100;
  const routeScore = graphLen ? r1(total / w) : legScoreAt(legs, score);
  const litPct = Math.round((litGood / w) * 100), busyPct = Math.round((busy / w) * 100);

  const nameOfRun = (r: Run) => { const byName = new Map<string, number>(); for (const l of r.legs) if (l.seg.name) byName.set(l.seg.name, (byName.get(l.seg.name) ?? 0) + legLength(l)); return [...byName].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; };
  const longest = (k: WatchArea['kind']) => watch.filter((x) => x.kind === k).sort((a, b) => b.m - a.m)[0];

  const reasons: Reason[] = [];
  const dark = longest('dark'), quiet = longest('quiet');
  if (dark) reasons.push({ code: 'DARK_STRETCH', tone: 'bad', meters: Math.round(dark.m), name: nameOfRun(dark) });
  reasons.push({ code: 'CONFIRMED_REPORTS', tone: reportIds.size ? 'bad' : 'good', count: reportIds.size });
  reasons.push({ code: 'OPEN_PLACES', tone: open.size >= 2 ? 'good' : open.size === 1 ? 'warn' : 'bad', count: open.size });
  reasons.push({ code: 'LIT_PCT', tone: litPct >= 80 ? 'good' : litPct >= 50 ? 'warn' : 'bad', pct: litPct });
  if (police.size) reasons.push({ code: 'POLICE_NEAR', tone: 'good', count: police.size });
  if (busyPct >= 60) reasons.push({ code: 'BUSY_PCT', tone: 'good', pct: busyPct });
  if (quiet) reasons.push({ code: 'QUIET_STRETCH', tone: 'warn', meters: Math.round(quiet.m), name: nameOfRun(quiet) });
  if (mode === 'wheelchair') {
    if (access.steps) reasons.push({ code: 'STEPS', tone: 'bad', count: access.steps });
    if (access.steep_m) reasons.push({ code: 'STEEP', tone: 'warn', meters: access.steep_m });
    if (access.accessible_toilets) reasons.push({ code: 'ACCESSIBLE_TOILET', tone: 'good', count: access.accessible_toilets });
    if (access.lowered_kerbs) reasons.push({ code: 'LOWERED_KERBS', tone: 'good', count: access.lowered_kerbs });
  }
  const dataLimited = unknownLit / w > 0.3;
  if (dataLimited) reasons.push({ code: 'DATA_LIMITED', tone: 'info' });
  reasons.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);

  const watchAreas: WatchArea[] = watch.map((r) => {
    const mid = r.legs[Math.floor(r.legs.length / 2)];
    const g = legGeometry(mid);
    const sc = Math.min(...r.legs.map((l) => score(l.seg).score));
    return { segment_id: mid.seg.id, name: nameOfRun(r), kind: r.kind, meters: Math.round(r.m), score: sc, at: g[Math.floor(g.length / 2)] };
  }).sort((a, b) => a.score - b.score).slice(0, 5);

  const later = new Date(t.getTime() + 3600_000);
  const laterScore = legScoreAt(legs, scorer(pg, later, now));

  return {
    kind, mode, segment_ids: legs.map((l) => l.seg.id).filter((id, i, a) => a[i - 1] !== id), geometry,
    length_m: Math.round(length), duration_s: Math.round(length / speedOf(mode)), score: routeScore,
    factors: f, reasons, worst_segment: worst && worst.score < SCORE_BANDS.caution ? worst : null, data_limited: dataLimited,
    access, steps: buildSteps(legs, geoms), watch_areas: watchAreas, score_later: { at: later.toISOString(), score: laterScore },
  };
}

const isOpenFull = (p: { hours: string | null }, t: Date) => isOpenAt(p.hours, t) === true;

export function planOnGraph(pg: Prepared, i: PlanInput): PlanResult {
  const mode: TravelMode = i.mode ?? 'walk';
  const now = i.now ?? new Date();
  const t = i.departure_at.getTime() < now.getTime() - 60_000 ? now : i.departure_at; // past departure -> now
  const o: Pt = [i.origin.lat, i.origin.lng], d: Pt = [i.destination.lat, i.destination.lng];
  const so = snap(pg, o), sd = snap(pg, d);
  if (!so || !sd) throw new ApiError('OUT_OF_AREA', 'Origin or destination is outside the mapped area');
  if (dist(o, d) < 15) throw new ApiError('NO_ROUTE', 'Origin and destination are the same place');
  const score = scorer(pg, t, now);

  let strict = mode === 'wheelchair';
  let fastLegs = dijkstra(pg, so, sd, routeCost(mode, strict, null));
  if (!fastLegs && strict) { strict = false; fastLegs = dijkstra(pg, so, sd, routeCost(mode, false, null)); }
  if (!fastLegs) throw new ApiError('NO_ROUTE', 'No walkable route was found');
  const fastLen = fastLegs.reduce((n, l) => n + legLength(l), 0);

  let alpha = SAFETY_ALPHA;
  let safeLegs = fastLegs;
  for (let k = 0; k < 4; k++) {
    const cand = dijkstra(pg, so, sd, routeCost(mode, strict, { alpha, score }));
    if (cand) {
      const len = cand.reduce((n, l) => n + legLength(l), 0);
      if (len <= MAX_DETOUR_RATIO * fastLen + 30) { safeLegs = cand; break; }
    }
    alpha /= 2;
  }

  const fastest = buildOption('fastest', mode, fastLegs, pg, o, d, t, now, score, strict);
  let safest = buildOption('safest', mode, safeLegs, pg, o, d, t, now, score, strict);
  // never call a lower-scoring route "safest"
  if (safest.score < fastest.score) safest = { ...fastest, kind: 'safest' };
  const same = safest.segment_ids.join(',') === fastest.segment_ids.join(',');
  return {
    fastest, safest, same_route: same, extra_minutes: Math.max(0, Math.round((safest.duration_s - fastest.duration_s) / 60)),
    departure_at: t.toISOString(), graph_version: pg.graph.version, simulated: pg.graph.simulated, mode,
  };
}

/** Nearest point on the graph to p (for "you are here" snapping or debugging). */
export function nearestOnGraph(pg: Prepared, p: Pt) { const s = snap(pg, p); return s ? { segment_id: s.seg.id, d: s.d, at: pointToPolyline(p, s.seg.geometry).q } : null; }
