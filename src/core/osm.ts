// Builds the road graph JSON (contract format) from raw OpenStreetMap / Overpass elements.
// Pure function: used by scripts/build-graph.ts (Node) and by the live fallback in the browser.
// No config.ts import here so it also runs in Node without Vite.
import type { Graph, GraphNode, GraphPoi, GraphSegment, Lit, Place, PoiType, RoadType, SegmentAccess } from './types';
import { polylineLength, type Pt } from './geo';

export type OsmElement = {
  type: 'node' | 'way' | 'relation'; id: number;
  lat?: number; lon?: number; center?: { lat: number; lon: number };
  nodes?: number[]; geometry?: ({ lat: number; lon: number } | null)[];
  tags?: Record<string, string>;
};

const WALKABLE = /^(trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|pedestrian|footway|path|steps|track|cycleway|corridor|road)$/;

/** Overpass QL for a bbox [south, west, north, east]: walkable ways with geometry + POIs that feed the score. */
export function overpassQuery(b: [number, number, number, number], timeout = 60): string {
  const bb = b.map((x) => x.toFixed(5)).join(',');
  return `[out:json][timeout:${timeout}];
(
  way[highway~"^(trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service|pedestrian|footway|path|steps|track|cycleway|corridor|road)$"](${bb});
)->.w;
.w out geom;
(
  nwr[shop](${bb});
  nwr[amenity~"^(police|cafe|restaurant|fast_food|marketplace|bus_station|hospital|clinic|pharmacy|doctors|fuel|atm|bank)$"](${bb});
  nwr[amenity=toilets][wheelchair~"^(yes|designated)$"](${bb});
  node[highway~"^(bus_stop|street_lamp)$"](${bb});
  node[public_transport=platform](${bb});
  node[man_made=surveillance](${bb});
  node[kerb~"^(lowered|flush)$"](${bb});
  node[barrier=kerb][kerb~"^(lowered|flush)$"](${bb});
);
out center tags;`;
}

function roadType(t: Record<string, string>): RoadType {
  const h = t.highway;
  const name = t.name ?? '';
  if (/^(gg\.?|gang)\s/i.test(name) || /골목/.test(name)) return 'alley';
  if (/^(trunk|primary)/.test(h)) return 'primary';
  if (h.startsWith('secondary')) return 'secondary';
  if (h.startsWith('tertiary')) return 'tertiary';
  if (h === 'service') return t.service === 'alley' || (t.width && parseFloat(t.width) < 3) ? 'alley' : 'residential';
  if (/^(residential|living_street|unclassified|road)$/.test(h)) return 'residential';
  if (/^(footway|pedestrian|steps|corridor)$/.test(h)) return 'footway';
  return 'path';
}

function litOf(t: Record<string, string>): Lit {
  const v = t.lit;
  if (!v) return 'unknown';
  if (/^(yes|24\/7|automatic|interval|sunset-sunrise)$/.test(v)) return 'yes';
  if (/^(limited|partial|disused)$/.test(v)) return 'partial';
  if (v === 'no') return 'no';
  return 'unknown';
}

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = v.replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : undefined;
}

function accessOf(t: Record<string, string>): SegmentAccess | undefined {
  const a: SegmentAccess = {};
  if (t.highway === 'steps') a.steps = true;
  if (t.incline && /%/.test(t.incline)) { const n = num(t.incline); if (n !== undefined) a.incline_pct = Math.abs(n); }
  else if (t.incline && /°/.test(t.incline)) { const n = num(t.incline); if (n !== undefined) a.incline_pct = Math.abs(Math.tan((n * Math.PI) / 180) * 100); }
  if (t.surface) a.surface = t.surface;
  if (t.smoothness) a.smoothness = t.smoothness;
  const w = num(t['sidewalk:width'] ?? t['footway:width'] ?? (/^(footway|path|pedestrian)$/.test(t.highway) ? t.width : undefined));
  if (w !== undefined) a.width_m = w;
  if (t.wheelchair === 'yes' || t.wheelchair === 'designated') a.wheelchair = 'yes';
  else if (t.wheelchair === 'limited') a.wheelchair = 'limited';
  else if (t.wheelchair === 'no') a.wheelchair = 'no';
  const sw = t.sidewalk ?? t['sidewalk:both'];
  if (sw) a.sidewalk = /^(no|none|separate)$/.test(sw) ? (sw === 'separate' ? 'yes' : 'no') : 'yes';
  else if (/^(footway|pedestrian|path)$/.test(t.highway)) a.sidewalk = 'yes';
  return Object.keys(a).length ? a : undefined;
}

const CONVENIENCE = /indomaret|alfamart|alfamidi|circle ?k|lawson|family ?mart|7-eleven|gs25|cu\b|emart24|세븐일레븐|씨유|이마트24/i;

function poiType(t: Record<string, string>): PoiType | null {
  if (t.amenity === 'police') return 'police';
  if (t.amenity === 'toilets') return 'toilet_accessible';
  if (/^(hospital|clinic|pharmacy|doctors)$/.test(t.amenity ?? '')) return 'health';
  if (t.highway === 'street_lamp') return 'streetlight';
  if (t.man_made === 'surveillance') return 'cctv';
  if (t.highway === 'bus_stop' || t.public_transport === 'platform' || t.amenity === 'bus_station') return 'bus_stop';
  if (t.kerb === 'lowered' || t.kerb === 'flush') return 'kerb_lowered';
  if (t.shop || /^(cafe|restaurant|fast_food|marketplace|fuel|atm|bank)$/.test(t.amenity ?? '')) {
    return t.opening_hours === '24/7' ? 'shop24' : 'shop';
  }
  return null;
}

/** Hours when OSM has none: chain convenience stores (Indomaret, Alfamart, CU, GS25...) are usually open until late. */
function poiHours(t: Record<string, string>, type: PoiType): string | null {
  if (t.opening_hours) return t.opening_hours;
  if (type === 'shop' && t.shop === 'convenience' && CONVENIENCE.test(`${t.name ?? ''} ${t.brand ?? ''}`)) return '07:00-23:00';
  return null;
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** The 8 demo destinations around ITB (contract seed plan). */
export const ITB_PLACES: Place[] = [
  { id: 1, name_en: 'ITB Ganesha Gate', name_id: 'Gerbang Ganesha ITB', name_ko: 'ITB 가네샤 정문', lat: -6.8932, lng: 107.6105 },
  { id: 2, name_en: 'Salman Mosque', name_id: 'Masjid Salman', name_ko: '살만 모스크', lat: -6.8937, lng: 107.6114 },
  { id: 3, name_en: 'Simpang Dago', name_id: 'Simpang Dago', name_ko: '심빵 다고', lat: -6.8850, lng: 107.6133 },
  { id: 4, name_en: 'Boarding house, Tubagus Ismail', name_id: 'Kos Tubagus Ismail', name_ko: '투바구스 이스마일 하숙', lat: -6.8846, lng: 107.6188 },
  { id: 5, name_en: 'Boarding house, Cisitu', name_id: 'Kos Cisitu', name_ko: '치시투 하숙', lat: -6.8812, lng: 107.6105 },
  { id: 6, name_en: 'Boarding house, Sekeloa', name_id: 'Kos Sekeloa', name_ko: '세켈로아 하숙', lat: -6.8868, lng: 107.6168 },
  { id: 7, name_en: 'Taman Sari', name_id: 'Taman Sari', name_ko: '타만사리', lat: -6.8960, lng: 107.6075 },
  { id: 8, name_en: 'Plesiran', name_id: 'Plesiran', name_ko: '플레시란', lat: -6.8965, lng: 107.6090 },
];

export function buildGraph(elements: OsmElement[], opts: { version: string; city: string; bbox: [number, number, number, number]; places?: Place[] }): Graph {
  const ways = elements
    .filter((e) => e.type === 'way' && e.tags?.highway && WALKABLE.test(e.tags.highway) && e.nodes && e.geometry && e.nodes.length === e.geometry.length)
    .filter((e) => {
      const t = e.tags!;
      if (t.area === 'yes') return false;
      if (t.foot === 'no' || t.foot === 'private') return false;
      if ((t.access === 'private' || t.access === 'no') && !/^(yes|designated|permissive)$/.test(t.foot ?? '')) return false;
      return true;
    })
    .sort((a, b) => a.id - b.id);

  // vertices = way endpoints + nodes shared by 2+ ways
  const use = new Map<number, number>();
  for (const w of ways) for (const n of w.nodes!) use.set(n, (use.get(n) ?? 0) + 1);
  const coord = new Map<number, Pt>();
  const segs: GraphSegment[] = [];
  for (const w of ways) {
    const t = w.tags!;
    const ids = w.nodes!, geo = w.geometry!;
    if (geo.some((g) => !g)) continue; // partially outside the query bbox
    const pts = geo.map((g) => [round6(g!.lat), round6(g!.lon)] as Pt);
    ids.forEach((id, i) => coord.set(id, pts[i]));
    const name = t.name ?? t['name:id'] ?? t['name:en'] ?? t.ref ?? null;
    const rt = roadType(t), lit = litOf(t), access = accessOf(t);
    let start = 0;
    for (let i = 1; i < ids.length; i++) {
      const isVertex = i === ids.length - 1 || (use.get(ids[i]) ?? 0) > 1;
      if (!isVertex) continue;
      const g = pts.slice(start, i + 1);
      const len = polylineLength(g);
      if (len > 0.5 && ids[start] !== ids[i]) {
        const s: GraphSegment = { id: 0, from: ids[start], to: ids[i], name, road_type: rt, lit, length_m: Math.round(len * 10) / 10, geometry: g };
        if (access) s.access = access;
        if (lit === 'unknown') s.simulated_attrs = ['lit'];
        segs.push(s);
      }
      start = i;
    }
  }

  // keep only the largest connected component (union-find)
  const parent = new Map<number, number>();
  const find = (x: number): number => { let r = x; while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!; let c = x; while (c !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
  for (const s of segs) { if (!parent.has(s.from)) parent.set(s.from, s.from); if (!parent.has(s.to)) parent.set(s.to, s.to); const a = find(s.from), b = find(s.to); if (a !== b) parent.set(a, b); }
  const size = new Map<number, number>();
  for (const s of segs) { const r = find(s.from); size.set(r, (size.get(r) ?? 0) + s.length_m); }
  let bestRoot = -1, best = -1;
  for (const [r, n] of size) if (n > best) { best = n; bestRoot = r; }
  const kept = segs.filter((s) => find(s.from) === bestRoot);
  kept.forEach((s, i) => { s.id = i + 1; });
  const nodeIds = new Set<number>();
  for (const s of kept) { nodeIds.add(s.from); nodeIds.add(s.to); }
  const nodes: GraphNode[] = [...nodeIds].sort((a, b) => a - b).map((id) => ({ id, lat: coord.get(id)![0], lng: coord.get(id)![1] }));

  // POIs
  const pois: GraphPoi[] = [];
  const seen = new Set<string>();
  for (const e of elements) {
    if (e.type === 'way' && e.tags?.highway) continue;
    const t = e.tags ?? {};
    const type = poiType(t);
    if (!type) continue;
    const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
    if (lat == null || lng == null) continue;
    const key = `${e.type}${e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pois.push({ id: pois.length + 1, type, name: t.name ?? null, lat: round6(lat), lng: round6(lng), hours: poiHours(t, type) });
  }

  const places = (opts.places ?? []).filter((p) => p.lat >= opts.bbox[0] && p.lat <= opts.bbox[2] && p.lng >= opts.bbox[1] && p.lng <= opts.bbox[3]);
  return { version: opts.version, city: opts.city, simulated: false, bbox: opts.bbox, nodes, segments: kept, pois, places };
}

/** Rough sanity numbers for logs. */
export function graphSummary(g: Graph) {
  const byType: Record<string, number> = {};
  for (const p of g.pois) byType[p.type] = (byType[p.type] ?? 0) + 1;
  const litKnown = g.segments.filter((s) => s.lit !== 'unknown').length;
  const km = g.segments.reduce((n, s) => n + s.length_m, 0) / 1000;
  return { nodes: g.nodes.length, segments: g.segments.length, km: Math.round(km * 10) / 10, lit_tagged_pct: Math.round((litKnown / Math.max(1, g.segments.length)) * 100), pois: byType, places: g.places.length };
}

export const _test = { roadType, litOf, accessOf, poiType };
