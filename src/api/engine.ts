// Routing backend that runs in the browser: our own OSM road graph + rule-based scoring + weighted Dijkstra.
// 1. Static graph public/data/bandung-graph.json (built by `npm run build-graph`, covers the ITB pilot area).
// 2. Outside that area: the graph is built live from Overpass (OpenStreetMap) for a box around origin + destination.
// The graph path uses our safety score. Valhalla is a last-resort route fallback when no graph is available.
import { activityHeatmap } from '../core/heatmap';
import { SCORE_WEIGHTS } from '../core/config';
import { bboxOf, dist, inBbox, type Pt } from '../core/geo';
import { buildGraph, ITB_PLACES, overpassQuery, type OsmElement } from '../core/osm';
import { planOnGraph } from '../core/planner';
import { snap } from '../core/routing';
import { applyCommunity, cityClock, hourFactor, prepareGraph, type Prepared, type SegmentRating } from '../core/scoring';
import { ApiError, type CalculationBasis, type DepartureMode, type Graph, type HeatPoint, type LatLng, type PlanResult, type Report, type TravelMode } from '../core/types';

const STATIC_URL = `${import.meta.env.BASE_URL ?? '/'}data/bandung-graph.json`;
const OVERPASS = [...new Set([import.meta.env.VITE_OVERPASS_URL, 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'].filter(Boolean) as string[])];
const VALHALLA_URL = (import.meta.env.VITE_VALHALLA_URL || 'https://valhalla1.openstreetmap.de').replace(/\/$/, '');
const LIVE_PAD_M = 600;        // margin around origin/destination for a live graph
const LIVE_MAX_SPAN_M = 9000;  // larger trips are not a walking use case
const ITB_BOX: [number, number, number, number] = [-6.905, 107.598, -6.876, 107.628];

export type Community = { reports: () => Promise<Report[]>; ratings: () => Promise<SegmentRating[]> };

let staticPg: Promise<Prepared | null> | null = null;
const live = new Map<string, Promise<Prepared>>();
let lastPg: Prepared | null = null;
const liveReady: Prepared[] = []; // live graphs already downloaded (reused for nearby trips)

function loadStatic(): Promise<Prepared | null> {
  staticPg ??= fetch(STATIC_URL)
    .then((r) => (r.ok ? (r.json() as Promise<Graph>) : null))
    .then((g) => (g && g.segments?.length ? prepareGraph(g) : null))
    .catch(() => null)
    .then((pg) => { if (!pg) staticPg = null; return pg; }); // a failed download is retried next time, not cached
  return staticPg;
}

/** Download + prepare the ITB graph in the background so the first route is instant. */
export function warmUp() { void loadStatic(); }

/** Ask all Overpass mirrors at once and take the first good answer (they are often slow or busy). */
async function overpass(query: string, timeoutMs = 8_000): Promise<OsmElement[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await Promise.any(OVERPASS.map(async (url) => {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return ((await res.json()) as { elements: OsmElement[] }).elements;
    }));
  } catch (e) {
    throw new ApiError('NETWORK', `Map data (OpenStreetMap) is unavailable: ${String(e)}`);
  } finally { clearTimeout(timer); ctrl.abort(); }
}

type ValhallaManeuver = { type?: number; instruction?: string; street_names?: string[]; begin_shape_index?: number; length?: number };
type ValhallaLeg = { shape?: string; summary?: { length?: number; time?: number }; maneuvers?: ValhallaManeuver[] };

/** Decode Valhalla's polyline6 response into [lat,lng] points. */
function decodePolyline6(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  const read = () => {
    let result = 0, shift = 0, byte = 0;
    do {
      if (index >= encoded.length) throw new Error('Invalid route geometry');
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return (result & 1) ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += read(); lng += read();
    points.push([lat / 1e6, lng / 1e6]);
  }
  return points;
}

function fallbackManeuver(type = 8): NonNullable<PlanResult['fastest']['steps']>[number]['maneuver'] {
  if (type === 1) return 'depart';
  if (type === 4) return 'arrive';
  if ([9, 16].includes(type)) return type === 9 ? 'slight_right' : 'slight_left';
  if ([10, 15].includes(type)) return type === 10 ? 'right' : 'left';
  if ([11, 14].includes(type)) return type === 11 ? 'sharp_right' : 'sharp_left';
  return 'straight';
}

/**
 * Last-resort route provider when no OSM graph is available. It supplies a real
 * OSM-based route, but has no per-segment safety/community data; both choices
 * therefore share one route and are explicitly marked data-limited.
 */
async function fallbackRoutes(i: { origin: LatLng; destination: LatLng; departure_at: Date; departure_mode?: DepartureMode; mode?: TravelMode }): Promise<PlanResult> {
  const mode = i.mode ?? 'walk';
  const basis: CalculationBasis = i.departure_mode === 'now' ? 'current' : i.departure_mode === 'scheduled' ? 'forecast' : i.departure_at.getTime() > Date.now() + 60_000 ? 'forecast' : 'current';
  const payload = {
    locations: [
      { lat: i.origin.lat, lon: i.origin.lng, type: 'break' },
      { lat: i.destination.lat, lon: i.destination.lng, type: 'break' },
    ],
    costing: 'pedestrian', units: 'kilometers', shape_format: 'polyline6',
    costing_options: { pedestrian: { type: mode === 'wheelchair' ? 'wheelchair' : 'foot' } },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const url = `${VALHALLA_URL}/route?json=${encodeURIComponent(JSON.stringify(payload))}`;
    const response = await fetch(url, { headers: { 'X-Client-Id': 'GIL:ON; github.com/tsabitakhoir/itbxcau_hackathon' }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json() as { trip?: { status?: number; legs?: ValhallaLeg[] } };
    const leg = json.trip?.legs?.[0];
    if (json.trip?.status !== 0 || !leg?.shape || !leg.summary || !Number.isFinite(leg.summary.length) || !Number.isFinite(leg.summary.time)) throw new Error('No route returned');
    const geometry = decodePolyline6(leg.shape);
    if (geometry.length < 2) throw new Error('Route geometry is empty');
    const steps = (leg.maneuvers ?? []).map((m) => ({
      maneuver: fallbackManeuver(m.type), name: m.street_names?.join(', ') || null,
      distance_m: Math.round((m.length ?? 0) * 1000),
      at: geometry[Math.min(m.begin_shape_index ?? 0, geometry.length - 1)],
    }));
    const activity = hourFactor(cityClock(i.departure_at, 420)); // historical Bandung activity profile, used when route edge data is unavailable
    const factors = { lighting: 0.5, facilities: 0.5, crowd: activity, reports: 0.5, community_penalty: 0 };
    const score = Math.round((1 + 4 * (
      SCORE_WEIGHTS.lighting * factors.lighting + SCORE_WEIGHTS.facilities * factors.facilities +
      SCORE_WEIGHTS.crowd * factors.crowd + SCORE_WEIGHTS.reports * factors.reports
    )) * 10) / 10;
    const reasons = [{ code: 'DATA_LIMITED' as const, tone: 'info' as const }];
    const common = {
      segment_ids: [], geometry, length_m: Math.round(leg.summary.length! * 1000),
      duration_s: Math.round(leg.summary.time!), score, factors,
      reasons, worst_segment: null, data_limited: true,
      access: mode === 'wheelchair' ? { steps: 0, steep_m: 0, narrow_m: 0, lowered_kerbs: 0, accessible_toilets: 0, wheelchair_ok: false, accessibility_verified: false } : undefined,
      steps,
    };
    const fastest = { ...common, kind: 'fastest' as const, mode };
    const safest = { ...common, kind: 'safest' as const, mode };
    return {
      fastest, safest, same_route: true, extra_minutes: 0,
      departure_at: i.departure_at.toISOString(), calculation_basis: basis, graph_version: 'valhalla-fallback', simulated: false, mode,
    };
  } catch (e) {
    throw new ApiError('NETWORK', `Map routing is temporarily unavailable: ${String(e)}`);
  } finally { clearTimeout(timer); }
}

function canFallback(e: unknown): boolean {
  return e instanceof ApiError && ['NETWORK', 'OUT_OF_AREA', 'NO_ROUTE'].includes(e.code);
}

function liveGraph(box: [number, number, number, number]): Promise<Prepared> {
  const key = box.map((x) => x.toFixed(3)).join(',');
  let p = live.get(key);
  if (!p) {
    p = overpass(overpassQuery(box, 25)).then((els) => {
      const g = buildGraph(els, { version: `osm-live-${new Date().toISOString().slice(0, 10)}`, city: 'live', bbox: box, places: ITB_PLACES });
      if (!g.segments.length) throw new ApiError('OUT_OF_AREA', 'No mapped streets here');
      const pg = prepareGraph(g);
      liveReady.push(pg);
      return pg;
    });
    p.catch(() => live.delete(key));
    live.set(key, p);
  }
  return p;
}

/** Graph that covers both points: the static pilot graph when possible, else a live one. */
async function graphFor(points: Pt[]): Promise<Prepared> {
  const st = await loadStatic();
  if (st && points.every((p) => inBbox(p, st.graph.bbox) && snap(st, p))) return st;
  const span = Math.max(...points.flatMap((a) => points.map((b) => dist(a, b))));
  if (span > LIVE_MAX_SPAN_M) throw new ApiError('OUT_OF_AREA', 'Too far for a walking route');
  const ready = liveReady.find((pg) => points.every((p) => inBbox(p, pg.graph.bbox) && snap(pg, p)));
  if (ready) return ready;
  // round the box outward to a ~550 m grid so small moves of the user reuse the same download
  const G = 0.005;
  const b = bboxOf(points, LIVE_PAD_M);
  return liveGraph([Math.floor(b[0] / G) * G, Math.floor(b[1] / G) * G, Math.ceil(b[2] / G) * G, Math.ceil(b[3] / G) * G]);
}

export async function loadGraph(): Promise<Graph> {
  const st = await loadStatic();
  if (st) return st.graph;
  return (await liveGraph(ITB_BOX)).graph;
}

/** True when both points are covered by the bundled ITB graph (no network needed). */
async function inStaticArea(points: Pt[]): Promise<boolean> {
  const st = await loadStatic();
  return !!st && points.every((p) => inBbox(p, st.graph.bbox) && snap(st, p));
}

export async function planRoutes(i: { origin: LatLng; destination: LatLng; departure_at: Date; departure_mode?: DepartureMode; mode?: TravelMode }, community: Community): Promise<PlanResult> {
  const pts: Pt[] = [[i.origin.lat, i.origin.lng], [i.destination.lat, i.destination.lng]];
  if (dist(pts[0], pts[1]) < 15) throw new ApiError('NO_ROUTE', 'Origin and destination are the same place');
  const withCommunity = async (pg: Prepared) => {
    const [reports, ratings] = await Promise.all([community.reports().catch(() => []), community.ratings().catch(() => [])]);
    applyCommunity(pg, reports, ratings);
    lastPg = pg;
    return planOnGraph(pg, i);
  };
  // Fast path: the bundled ITB graph, no network calls except community reports.
  if (await inStaticArea(pts)) return withCommunity((await loadStatic())!);
  if (dist(pts[0], pts[1]) > LIVE_MAX_SPAN_M) throw new ApiError('OUT_OF_AREA', 'Too far for a walking route');
  // Outside ITB: build a live graph from Overpass and, at the same time, ask Valhalla as a backup,
  // so a slow or busy Overpass never makes the user wait for two timeouts in a row.
  const backup = fallbackRoutes(i);
  backup.catch(() => undefined);
  try {
    return await withCommunity(await graphFor(pts));
  } catch (e) {
    if (!canFallback(e)) throw e;
    return backup;
  }
}

export async function getActivityHeatmap(departure_at: Date, community?: Community): Promise<HeatPoint[]> {
  const pg = lastPg ?? (await loadStatic());
  if (!pg) return [];
  if (community) applyCommunity(pg, await community.reports().catch(() => []), await community.ratings().catch(() => []));
  return activityHeatmap(pg, departure_at);
}

/** Nearest segment id for a report (null when off the map). */
export async function segmentAt(p: LatLng): Promise<{ segment_id: number | null; graph_version: string }> {
  const pg = lastPg ?? (await loadStatic());
  if (!pg) return { segment_id: null, graph_version: 'none' };
  const s = snap(pg, [p.lat, p.lng], 60);
  return { segment_id: s?.seg.id ?? null, graph_version: pg.graph.version };
}
