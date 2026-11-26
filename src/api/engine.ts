// Routing backend that runs in the browser: our own OSM road graph + rule-based scoring + weighted Dijkstra.
// 1. Static graph public/data/bandung-graph.json (built by `npm run build-graph`, covers the ITB pilot area).
// 2. Outside that area: the graph is built live from Overpass (OpenStreetMap) for a box around origin + destination.
// No external routing service is used: the route really follows our safety score.
import { activityHeatmap } from '../core/heatmap';
import { bboxOf, dist, inBbox, type Pt } from '../core/geo';
import { buildGraph, ITB_PLACES, overpassQuery, type OsmElement } from '../core/osm';
import { planOnGraph } from '../core/planner';
import { snap } from '../core/routing';
import { applyCommunity, prepareGraph, type Prepared, type SegmentRating } from '../core/scoring';
import { ApiError, type Graph, type HeatPoint, type LatLng, type PlanResult, type Report, type TravelMode } from '../core/types';

const STATIC_URL = `${import.meta.env.BASE_URL ?? '/'}data/bandung-graph.json`;
const OVERPASS = [import.meta.env.VITE_OVERPASS_URL, 'https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'].filter(Boolean) as string[];
const LIVE_PAD_M = 600;        // margin around origin/destination for a live graph
const LIVE_MAX_SPAN_M = 9000;  // larger trips are not a walking use case
const ITB_BOX: [number, number, number, number] = [-6.905, 107.598, -6.876, 107.628];

export type Community = { reports: () => Promise<Report[]>; ratings: () => Promise<SegmentRating[]> };

let staticPg: Promise<Prepared | null> | null = null;
const live = new Map<string, Promise<Prepared>>();
let lastPg: Prepared | null = null;

function loadStatic(): Promise<Prepared | null> {
  staticPg ??= fetch(STATIC_URL)
    .then((r) => (r.ok ? (r.json() as Promise<Graph>) : null))
    .then((g) => (g && g.segments?.length ? prepareGraph(g) : null))
    .catch(() => null);
  return staticPg;
}

async function overpass(query: string): Promise<OsmElement[]> {
  let lastErr: unknown = null;
  for (const url of OVERPASS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { elements: OsmElement[] };
      return json.elements;
    } catch (e) { lastErr = e; } finally { clearTimeout(timer); }
  }
  throw new ApiError('NETWORK', `Map data (OpenStreetMap) is unavailable: ${String(lastErr)}`);
}

function liveGraph(box: [number, number, number, number]): Promise<Prepared> {
  const key = box.map((x) => x.toFixed(3)).join(',');
  let p = live.get(key);
  if (!p) {
    p = overpass(overpassQuery(box, 45)).then((els) => {
      const g = buildGraph(els, { version: `osm-live-${new Date().toISOString().slice(0, 10)}`, city: 'live', bbox: box, places: ITB_PLACES });
      if (!g.segments.length) throw new ApiError('OUT_OF_AREA', 'No mapped streets here');
      return prepareGraph(g);
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
  return liveGraph(bboxOf(points, LIVE_PAD_M));
}

export async function loadGraph(): Promise<Graph> {
  const st = await loadStatic();
  if (st) return st.graph;
  return (await liveGraph(ITB_BOX)).graph;
}

export async function planRoutes(i: { origin: LatLng; destination: LatLng; departure_at: Date; mode?: TravelMode }, community: Community): Promise<PlanResult> {
  const pg = await graphFor([[i.origin.lat, i.origin.lng], [i.destination.lat, i.destination.lng]]);
  const [reports, ratings] = await Promise.all([community.reports().catch(() => []), community.ratings().catch(() => [])]);
  applyCommunity(pg, reports, ratings);
  lastPg = pg;
  return planOnGraph(pg, i);
}

export async function getActivityHeatmap(departure_at: Date, community?: Community): Promise<HeatPoint[]> {
  const pg = lastPg ?? (await loadStatic()) ?? (await liveGraph(ITB_BOX).catch(() => null));
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
