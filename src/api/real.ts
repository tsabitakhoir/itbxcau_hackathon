// Live OpenStreetMap routing and map context; user-generated data stays local
// until the project has a hosted backend. Scores are transparent heuristics,
// not an AI prediction or a guarantee of personal safety.
export * from './mock';

import * as local from './mock';
import { ApiError, type Graph, type HeatPoint, type LatLng, type Place, type PlanResult, type Report, type RouteOption } from '../core/types';
import { HELP_WEIGHTS, LIT_VALUE, MAX_DETOUR_RATIO, REPORT_PENALTY, SCORE_WEIGHTS } from '../core/config';

const OVERPASS = import.meta.env.VITE_OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const FOOT_ROUTER = import.meta.env.VITE_FOOT_ROUTER_URL || 'https://routing.openstreetmap.de/routed-foot/route/v1/driving';
const ITB_BOX: [number, number, number, number] = [-6.905, 107.598, -6.876, 107.628];
const CACHE_MS = 15 * 60_000;
const GEOCODE_CACHE_MS = 24 * 60 * 60_000;
type Element = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
type Feature = { id: number; lat: number; lng: number; tags: Record<string, string>; type: string };
type RouteResponse = { code: string; routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[] };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController(); const timer = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as T;
  } finally { window.clearTimeout(timer); }
}
async function osm(query: string): Promise<Element[]> {
  const key = `gil-osm:${query}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) { const cached = JSON.parse(raw) as { at: number; elements: Element[] }; if (Date.now() - cached.at < CACHE_MS) return cached.elements; }
  } catch { /* use network */ }
  const body = new URLSearchParams({ data: query });
  const result = await requestJson<{ elements: Element[] }>(OVERPASS, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } });
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), elements: result.elements })); } catch { /* storage is optional */ }
  return result.elements;
}
const tagsOf = (e: Element) => e.tags ?? {};
function feature(e: Element): Feature | null {
  const p = e.center ?? (e.lat != null && e.lon != null ? { lat: e.lat, lon: e.lon } : null);
  return p ? { id: e.id, lat: p.lat, lng: p.lon, tags: tagsOf(e), type: e.type } : null;
}
function bbox(points: [number, number][]): [number, number, number, number] {
  const lats = points.map((p) => p[0]), lngs = points.map((p) => p[1]);
  const pad = 0.0012;
  return [Math.min(...lats) - pad, Math.min(...lngs) - pad, Math.max(...lats) + pad, Math.max(...lngs) + pad];
}
const overpassAround = (b: [number, number, number, number]) =>
  `[out:json][timeout:20];(way[highway](${b.join(',')});node[shop](${b.join(',')});way[shop](${b.join(',')});node[amenity~"police|cafe|restaurant|fast_food|bus_station|shelter"](${b.join(',')});way[amenity~"police|cafe|restaurant|fast_food|bus_station|shelter"](${b.join(',')});node[highway=bus_stop](${b.join(',')}););out center tags;`;
const distanceM = (a: LatLng, b: LatLng) => { const rad = Math.PI / 180, x = (b.lng - a.lng) * rad * Math.cos((a.lat + b.lat) * rad / 2), y = (b.lat - a.lat) * rad; return 6371000 * Math.hypot(x, y); };
function nearestDistance(p: LatLng, geom: [number, number][]) { let d = Infinity; for (const [lat, lng] of geom) d = Math.min(d, distanceM(p, { lat, lng })); return d; }
function helpWeight(t: Record<string, string>) {
  if (t.amenity === 'police') return HELP_WEIGHTS.police;
  if (t.shop) return t.opening_hours?.includes('24/7') ? HELP_WEIGHTS.shop24 : HELP_WEIGHTS.shop;
  if (t.highway === 'bus_stop' || t.amenity === 'bus_station' || t.amenity === 'shelter') return HELP_WEIGHTS.bus_stop;
  return 0;
}
function makeOption(kind: 'fastest' | 'safest', r: NonNullable<RouteResponse['routes']>[number], features: Feature[], reports: Report[]): RouteOption {
  const geom = r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
  const roads = features.filter((f) => f.tags.highway);
  const samples = geom.filter((_, i) => i % Math.max(1, Math.floor(geom.length / 30)) === 0);
  let lightSum = 0, litKnown = 0, litYes = 0, roadActivity = 0;
  for (const p of samples) {
    let near: Feature | undefined, nearD = Infinity;
    for (const road of roads) { const d = distanceM({ lat: p[0], lng: p[1] }, { lat: road.lat, lng: road.lng }); if (d < nearD) { near = road; nearD = d; } }
    if (near && nearD < 120) {
      const lit = near.tags.lit;
      if (lit === 'yes') { lightSum += LIT_VALUE.yes; litKnown++; litYes++; }
      else if (lit === 'no') { lightSum += LIT_VALUE.no; litKnown++; }
      else if (lit === 'limited' || lit === 'automatic') { lightSum += LIT_VALUE.partial; litKnown++; }
      else lightSum += LIT_VALUE.unknown;
      roadActivity += ({ primary: 1, secondary: .85, tertiary: .7, residential: .5, footway: .4, path: .3, service: .35 } as Record<string, number>)[near.tags.highway ?? ''] ?? .45;
    } else { lightSum += LIT_VALUE.unknown; roadActivity += .4; }
  }
  const nearby = features.filter((f) => !f.tags.highway && nearestDistance({ lat: f.lat, lng: f.lng }, geom) < 60);
  const help = nearby.reduce((n, f) => n + helpWeight(f.tags), 0);
  const community = reports.filter((x) => x.confirmed && nearestDistance({ lat: x.lat, lng: x.lng }, geom) < 50);
  const penalty = Math.min(.6, community.reduce((n, x) => n + (REPORT_PENALTY[x.category] ?? .1), 0));
  const lighting = lightSum / Math.max(samples.length, 1);
  const activity = Math.min(1, roadActivity / Math.max(samples.length, 1) + Math.min(.2, nearby.length * .025));
  const helpAccess = Math.min(1, help / 1.5);
  const score = Math.round((1 + 4 * (SCORE_WEIGHTS.lighting * lighting + SCORE_WEIGHTS.activity * activity + SCORE_WEIGHTS.help_access * helpAccess) * (1 - penalty)) * 10) / 10;
  const reasons: RouteOption['reasons'] = [
    { code: 'LIT_PCT', tone: litKnown ? 'info' : 'warn', pct: Math.round(litYes / Math.max(samples.length, 1) * 100) },
    { code: 'OPEN_PLACES', tone: nearby.length ? 'good' : 'warn', count: nearby.length },
    { code: 'CONFIRMED_REPORTS', tone: community.length ? 'bad' : 'good', count: community.length },
  ];
  const police = nearby.filter((f) => f.tags.amenity === 'police').length;
  if (police) reasons.push({ code: 'POLICE_NEAR', tone: 'good', count: police });
  return { kind, segment_ids: [], geometry: geom, length_m: Math.round(r.distance), duration_s: Math.round(r.duration), score, factors: { lighting, activity, help_access: helpAccess, community_penalty: penalty }, reasons, worst_segment: null, data_limited: litKnown / Math.max(samples.length, 1) < .7 };
}

export async function planRoutes(i: { origin: LatLng; destination: LatLng; departure_at: Date }): Promise<PlanResult> {
  const coords = `${i.origin.lng},${i.origin.lat};${i.destination.lng},${i.destination.lat}`;
  let routed: RouteResponse;
  try { routed = await requestJson<RouteResponse>(`${FOOT_ROUTER}/${coords}?alternatives=3&overview=full&geometries=geojson&steps=false`); }
  catch { throw new ApiError('NETWORK', 'The walking route service is unavailable. Please try again.'); }
  if (routed.code !== 'Ok' || !routed.routes?.length) throw new ApiError('NO_ROUTE', 'No walkable route was found.');
  const candidates = routed.routes;
  const fastestRaw = [...candidates].sort((a, b) => a.duration - b.duration)[0];
  const maxDuration = fastestRaw.duration * MAX_DETOUR_RATIO;
  let features: Feature[] = [];
  try { features = (await osm(overpassAround(bbox(candidates.flatMap((r) => r.geometry.coordinates))))).map(feature).filter((x): x is Feature => !!x); } catch { /* show route with limited OSM context */ }
  const reports = await local.listReports().catch(() => [] as Report[]);
  const eligible = candidates.filter((r) => r.duration <= maxDuration);
  const fastest = makeOption('fastest', fastestRaw, features, reports);
  const safestRaw = eligible.map((r) => makeOption('safest', r, features, reports)).sort((a, b) => b.score - a.score || a.duration_s - b.duration_s)[0];
  const safest = { ...safestRaw, kind: 'safest' as const };
  const same = fastest.geometry.length === safest.geometry.length && fastest.geometry.every((p, n) => distanceM({ lat: p[0], lng: p[1] }, { lat: safest.geometry[n][0], lng: safest.geometry[n][1] }) < 10);
  return { fastest, safest, same_route: same, extra_minutes: Math.round((safest.duration_s - fastest.duration_s) / 60), departure_at: i.departure_at.toISOString(), graph_version: `osm-${new Date().toISOString().slice(0, 10)}`, simulated: false };
}

export async function listPlaces(): Promise<Place[]> {
  const b = ITB_BOX.join(',');
  const q = `[out:json][timeout:20];(node[name][amenity](${b});way[name][amenity](${b});node[name][shop](${b});way[name][shop](${b});node[name][tourism](${b});way[name][tourism](${b}););out center tags;`;
  const items = (await osm(q)).map((e) => ({ e, p: feature(e) })).filter((x): x is { e: Element; p: Feature } => !!x.p && !!x.p.tags.name);
  const seen = new Set<string>();
  return items.map(({ e, p }) => { const name = p.tags.name; return { id: e.id, name_en: name, name_id: name, name_ko: name, lat: p.lat, lng: p.lng }; })
    .filter((p) => { const k = `${p.name_en}:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 24);
}

// Explicit-submit geocoding (not autocomplete) keeps public Nominatim traffic low.
export async function searchPlaces(query: string): Promise<Place[]> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 3) return [];
  const cacheKey = `gil-geocode:${normalized}`;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) { const cached = JSON.parse(raw) as { at: number; places: Place[] }; if (Date.now() - cached.at < GEOCODE_CACHE_MS) return cached.places; }
  } catch { /* fetch a fresh result */ }
  const throttleKey = 'gil-geocode:last-request';
  let last = 0;
  try { last = Number(localStorage.getItem(throttleKey) ?? 0); } catch { /* throttling is best effort */ }
  const waitMs = Math.max(0, 1_100 - (Date.now() - last));
  if (waitMs) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
  try { localStorage.setItem(throttleKey, String(Date.now())); } catch { /* throttling is best effort */ }
  const params = new URLSearchParams({
    q: `${query.trim()}, Bandung, Indonesia`, format: 'jsonv2', limit: '8', countrycodes: 'id',
    viewbox: '107.55,-6.84,107.70,-6.96', addressdetails: '0',
  });
  try {
    const results = await requestJson<{ place_id: number; name?: string; display_name: string; lat: string; lon: string; address?: { country_code?: string } }[]>(`https://nominatim.openstreetmap.org/search?${params}`);
    const places = results.map((item) => {
      const name = item.name || item.display_name.split(',')[0];
      return { id: -Math.abs(item.place_id), name_en: name, name_id: name, name_ko: name, display_name: item.display_name, lat: Number(item.lat), lng: Number(item.lon) };
    }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && distanceM({ lat: p.lat, lng: p.lng }, { lat: -6.8905, lng: 107.6125 }) < 50_000);
    try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), places })); } catch { /* cache is optional */ }
    return places;
  } catch { throw new ApiError('NETWORK', 'Place search is temporarily unavailable. Please try again.'); }
}

export async function loadGraph(): Promise<Graph> {
  const elements = await osm(overpassAround(ITB_BOX));
  const places = await listPlaces();
  return { version: `osm-${new Date().toISOString().slice(0, 10)}`, city: 'bandung', simulated: false, bbox: ITB_BOX, nodes: [], segments: elements.filter((e) => e.tags?.highway), pois: elements.filter((e) => e.tags?.amenity || e.tags?.shop), places };
}

export async function getActivityHeatmap(_departure_at: Date): Promise<HeatPoint[]> {
  try {
    const elements = await osm(overpassAround(ITB_BOX));
    return elements.map(feature).filter((x): x is Feature => !!x).filter((f) => helpWeight(f.tags) > 0 || f.tags.amenity === 'cafe' || f.tags.amenity === 'restaurant')
      .map((f) => [f.lat, f.lng, Math.min(1, Math.max(.2, helpWeight(f.tags) || .35))]);
  } catch { return []; }
}
