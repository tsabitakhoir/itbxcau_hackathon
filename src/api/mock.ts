// FE mock of the API contract (fe.md). Same signatures as src/api/index.ts.
// All data is SIMULATED around ITB Bandung. Errors can be forced with ?mockError=OUT_OF_AREA etc.
import { CONFIRM_THRESHOLD, DEMO_MODE, EMERGENCY_NUMBERS, LATE_GRACE_MIN, WALK_SPEED_MPS } from '../core/config';
import {
  ApiError,
  type ApiErrorCode, type Country, type EmergencyContact, type Graph, type HeatPoint, type LatLng, type Place, type PlanResult,
  type Profile, type Report, type ReportCategory, type RouteKind, type RouteOption, type SharedTrip, type SosResult, type Trip,
} from '../core/types';

const GRAPH_VERSION = '2026-11-25-1';
const BBOX: [number, number, number, number] = [-6.9, 107.603, -6.878, 107.622];
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

function maybeFail() {
  const code = new URLSearchParams(location.search).get('mockError') as ApiErrorCode | null;
  if (code) throw new ApiError(code, `Mock error ${code}`);
}

// ---------- persistence (localStorage so two tabs can demo the share link) ----------
const LS = 'gil-mock-v1';
type DB = { profile: Profile; contacts: EmergencyContact[]; trips: Trip[]; locations: Record<string, { lat: number; lng: number; recorded_at: string }>; sos: Record<string, { id: string; created_at: string; lat: number | null; lng: number | null; resolved: boolean }>; reports: Report[]; ratings: Record<string, number> };

const seedReports: Report[] = [];

function load(): DB {
  try { const raw = localStorage.getItem(LS); if (raw) { const db = JSON.parse(raw) as DB; db.reports = (db.reports ?? []).filter((r) => !r.simulated); return db; } } catch { /* ignore */ }
  return { profile: { id: 'mock-user', display_name: 'Nadia', lang: 'en', country: 'ID', id_verified_mock: false }, contacts: [{ id: 'c1', name: 'Mom', phone: '+6281234567890', channel: 'whatsapp' }], trips: [], locations: {}, sos: {}, reports: seedReports, ratings: {} };
}
function save(db: DB) { try { localStorage.setItem(LS, JSON.stringify(db)); } catch { /* ignore */ } }
const mutate = <T,>(fn: (db: DB) => T): T => { const db = load(); const r = fn(db); save(db); return r; };

// ---------- profile & contacts ----------
export async function ensureSession(): Promise<Profile> { await wait(100); return load().profile; }
export async function updateProfile(p: Partial<Omit<Profile, 'id'>>): Promise<Profile> { await wait(); return mutate((db) => (db.profile = { ...db.profile, ...p })); }
export async function listContacts(): Promise<EmergencyContact[]> { await wait(); return load().contacts; }
export async function addContact(c: Omit<EmergencyContact, 'id'>): Promise<EmergencyContact> { await wait(); return mutate((db) => { const n = { ...c, id: uid() }; db.contacts.push(n); return n; }); }
export async function deleteContact(id: string): Promise<void> { await wait(); mutate((db) => { db.contacts = db.contacts.filter((c) => c.id !== id); }); }

// ---------- graph & places ----------
const PLACES: Place[] = [
  { id: 1, name_en: 'ITB Ganesha Gate', name_id: 'Gerbang Ganesha ITB', name_ko: 'ITB 가네샤 정문', lat: -6.8932, lng: 107.6105 },
  { id: 2, name_en: 'Salman Mosque', name_id: 'Masjid Salman', name_ko: '살만 모스크', lat: -6.8937, lng: 107.6114 },
  { id: 3, name_en: 'Simpang Dago', name_id: 'Simpang Dago', name_ko: '심빵 다고', lat: -6.8850, lng: 107.6133 },
  { id: 4, name_en: 'Boarding house, Tubagus Ismail', name_id: 'Kos Tubagus Ismail', name_ko: '투바구스 이스마일 하숙', lat: -6.8846, lng: 107.6188 },
  { id: 5, name_en: 'Boarding house, Cisitu', name_id: 'Kos Cisitu', name_ko: '치시투 하숙', lat: -6.8812, lng: 107.6105 },
  { id: 6, name_en: 'Boarding house, Sekeloa', name_id: 'Kos Sekeloa', name_ko: '세켈로아 하숙', lat: -6.8868, lng: 107.6168 },
  { id: 7, name_en: 'Taman Sari', name_id: 'Taman Sari', name_ko: '타만사리', lat: -6.8960, lng: 107.6075 },
  { id: 8, name_en: 'Plesiran', name_id: 'Plesiran', name_ko: '플레시란', lat: -6.8965, lng: 107.6090 },
];
export async function loadGraph(): Promise<Graph> { await wait(100); return { version: GRAPH_VERSION, city: 'bandung', simulated: true, bbox: BBOX, nodes: [], segments: [], pois: [], places: PLACES }; }
export async function listPlaces(): Promise<Place[]> { await wait(100); return PLACES; }

// ---------- routing (mock geometry; real scoring + Dijkstra live in src/core, owned by BE) ----------
const inBox = (p: LatLng) => p.lat >= BBOX[0] && p.lat <= BBOX[2] && p.lng >= BBOX[1] && p.lng <= BBOX[3];
function distM(a: LatLng, b: LatLng) { const R = 6371000, r = Math.PI / 180; const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r; return Math.hypot(x, y) * R; }
function pathLen(g: [number, number][]) { let s = 0; for (let i = 1; i < g.length; i++) s += distM({ lat: g[i - 1][0], lng: g[i - 1][1] }, { lat: g[i][0], lng: g[i][1] }); return s; }
function hourOf(d: Date) { return d.getHours() + d.getMinutes() / 60; }

export async function planRoutes(i: { origin: LatLng; destination: LatLng; departure_at: Date }): Promise<PlanResult> {
  await wait(600); maybeFail();
  if (!inBox(i.origin) || !inBox(i.destination)) throw new ApiError('OUT_OF_AREA', 'Outside simulated area');
  if (distM(i.origin, i.destination) < 30) throw new ApiError('NO_ROUTE', 'Origin and destination are the same');
  const o = i.origin, d = i.destination;
  // fastest: zig-zag through the "alleys" (diagonal-ish); safest: along the main roads (L-shape via a wider corner)
  const fast: [number, number][] = [[o.lat, o.lng], [o.lat + (d.lat - o.lat) * 0.35, o.lng + (d.lng - o.lng) * 0.2], [o.lat + (d.lat - o.lat) * 0.6, o.lng + (d.lng - o.lng) * 0.65], [d.lat, d.lng]];
  const safe: [number, number][] = [[o.lat, o.lng], [o.lat, o.lng + (d.lng - o.lng) * 0.15], [d.lat + (d.lat - o.lat) * 0.12, o.lng + (d.lng - o.lng) * 0.15], [d.lat + (d.lat - o.lat) * 0.12, d.lng], [d.lat, d.lng]];
  const h = hourOf(i.departure_at);
  const night = h >= 21 || h < 5; // shops closed, quiet -> bigger gap (Temporal Data)
  const fl = pathLen(fast), sl = Math.max(pathLen(safe), fl * 1.12);
  const reports = load().reports.filter((r) => r.confirmed);
  const fastest: RouteOption = {
    kind: 'fastest', segment_ids: [12, 40, 41, 42], geometry: fast, length_m: Math.round(fl), duration_s: Math.round(fl / WALK_SPEED_MPS),
    score: 0,
    factors: { lighting: 0.55, activity: night ? 0.4 : 0.7, help_access: night ? 0.35 : 0.6, community_penalty: reports.some((r) => r.segment_id === 42) ? 0.25 : 0.12 },
    reasons: [
      { code: 'DARK_STRETCH', tone: 'bad', meters: 160, name: 'Gg. Sekeloa' },
      { code: 'CONFIRMED_REPORTS', tone: 'bad', count: reports.filter((r) => [40, 41, 42].includes(r.segment_id ?? -1)).length },
      { code: 'OPEN_PLACES', tone: 'warn', count: night ? 1 : 3 },
      { code: 'QUIET_STRETCH', tone: 'warn', meters: 120, name: 'Gg. Sekeloa' },
    ],
    worst_segment: night ? { id: 41, name: 'Gg. Sekeloa', score: 1.8 } : null, data_limited: false,
  };
  const safest: RouteOption = {
    kind: 'safest', segment_ids: [12, 13, 27, 28], geometry: safe, length_m: Math.round(sl), duration_s: Math.round(sl / WALK_SPEED_MPS),
    score: 0,
    factors: { lighting: 0.92, activity: night ? 0.74 : 0.86, help_access: 0.8, community_penalty: 0 },
    reasons: [
      { code: 'OPEN_PLACES', tone: 'good', count: night ? 3 : 7 },
      { code: 'LIT_PCT', tone: 'good', pct: 90 },
      { code: 'POLICE_NEAR', tone: 'good', count: 1 },
      { code: 'CONFIRMED_REPORTS', tone: 'good', count: 0 },
    ],
    worst_segment: null, data_limited: false,
  };
  // score = 1 + 4 * base * (1 - penalty), same formula as src/core (fe.md)
  for (const r of [fastest, safest]) { const f = r.factors; r.score = Math.round((1 + 4 * (0.4 * f.lighting + 0.3 * f.activity + 0.3 * f.help_access) * (1 - f.community_penalty)) * 10) / 10; }
  if (fastest.score >= 2.5) fastest.worst_segment = null;
  return { fastest, safest, same_route: false, extra_minutes: Math.round((safest.duration_s - fastest.duration_s) / 60), departure_at: i.departure_at.toISOString(), graph_version: GRAPH_VERSION, simulated: true };
}

export async function getActivityHeatmap(departure_at: Date): Promise<HeatPoint[]> {
  await wait(200);
  const h = hourOf(departure_at); const f = h >= 22 || h < 5 ? 0.5 : 1;
  const pts: HeatPoint[] = [];
  // main roads: Jl. Ir. H. Juanda (Dago) N-S, Jl. Ganesha E-W, Jl. Tamansari
  for (let lat = -6.899; lat <= -6.879; lat += 0.0004) pts.push([lat, 107.6135, 0.9 * f]);
  for (let lng = 107.604; lng <= 107.621; lng += 0.0004) pts.push([-6.8932, lng, 0.7 * f]);
  for (let lat = -6.899; lat <= -6.882; lat += 0.0004) pts.push([lat, 107.6078, 0.55 * f]);
  for (let lng = 107.6135; lng <= 107.621; lng += 0.0004) pts.push([-6.8846, lng, 0.6 * f]);
  // quiet alleys
  for (let t = 0; t <= 1; t += 0.05) pts.push([-6.8905 + t * 0.004, 107.6115 + t * 0.004, 0.15 * f]);
  return pts;
}

// ---------- trips ----------
export async function startTrip(i: { origin: LatLng & { label: string }; destination: LatLng & { label: string }; plan: PlanResult; chosen: RouteKind }): Promise<Trip> {
  await wait();
  const route = i.plan[i.chosen]; const now = new Date(); const token = uid();
  const trip: Trip = { id: uid(), status: 'active', chosen: i.chosen, departure_at: i.plan.departure_at, started_at: now.toISOString(), eta: new Date(now.getTime() + route.duration_s * 1000).toISOString(), arrived_at: null, share_token: token, share_url: `${location.origin}/t/${token}`, route, destination: i.destination };
  mutate((db) => { db.trips.push(trip); db.locations[trip.id] = { lat: i.origin.lat, lng: i.origin.lng, recorded_at: now.toISOString() }; });
  return trip;
}
export async function getTrip(id: string): Promise<Trip> { await wait(100); const t = load().trips.find((x) => x.id === id); if (!t) throw new ApiError('NOT_FOUND', 'Trip not found'); return t; } // FE helper (not in contract)
export async function pushLocation(trip_id: string, p: LatLng & { accuracy_m?: number }): Promise<void> { await wait(50); mutate((db) => { db.locations[trip_id] = { lat: p.lat, lng: p.lng, recorded_at: new Date().toISOString() }; }); }
export async function finishTrip(trip_id: string, status: 'arrived' | 'cancelled'): Promise<void> { await wait(); mutate((db) => { const t = db.trips.find((x) => x.id === trip_id); if (t) { t.status = status; t.arrived_at = status === 'arrived' ? new Date().toISOString() : null; } }); }
export async function rateTrip(trip_id: string, rating: 1 | 2 | 3 | 4 | 5): Promise<void> { await wait(); mutate((db) => { db.ratings[trip_id] = rating; }); }
export async function getSharedTrip(token: string): Promise<SharedTrip> {
  await wait(150); const db = load(); const t = db.trips.find((x) => x.share_token === token);
  if (!t || Date.now() - new Date(t.started_at).getTime() > 12 * 3600e3) throw new ApiError('NOT_FOUND', 'Unknown link');
  const sos = Object.values(db.sos).find((s) => s.id.startsWith(t.id) && !s.resolved) ?? null;
  return { status: t.status, display_name: db.profile.display_name, destination_label: t.destination.label, eta: t.eta, is_late: t.status === 'active' && Date.now() > new Date(t.eta).getTime() + LATE_GRACE_MIN * 60e3, route_geometry: t.route.geometry, last_location: db.locations[t.id] ?? null, sos: sos ? { created_at: sos.created_at, lat: sos.lat, lng: sos.lng } : null };
}

// ---------- SOS ----------
export async function triggerSos(i: { trip_id?: string; pos: LatLng | null; country: Country }): Promise<SosResult> {
  await wait(200); const db = load(); const number = EMERGENCY_NUMBERS[i.country];
  const id = `${i.trip_id ?? 'none'}:${uid()}`;
  db.sos[id] = { id, created_at: new Date().toISOString(), lat: i.pos?.lat ?? null, lng: i.pos?.lng ?? null, resolved: false };
  if (i.trip_id) { const t = db.trips.find((x) => x.id === i.trip_id); if (t) t.status = 'sos'; }
  save(db);
  const trip = db.trips.find((x) => x.id === i.trip_id);
  const map = i.pos ? `https://maps.google.com/?q=${i.pos.lat},${i.pos.lng}` : '';
  return { sos_id: id, tel_uri: `tel:${number}`, share_text: `SOS! I need help. My location: ${map}`, share_url: trip?.share_url ?? null, demo: DEMO_MODE };
}
export async function resolveSos(sos_id: string): Promise<void> {
  await wait(); mutate((db) => { const s = db.sos[sos_id]; if (s) s.resolved = true; const tripId = sos_id.split(':')[0]; const t = db.trips.find((x) => x.id === tripId); if (t && t.status === 'sos') t.status = 'active'; });
}

// ---------- reports ----------
export async function listReports(): Promise<Report[]> { await wait(); return load().reports; }
export async function createReport(i: { pos: LatLng; category: ReportCategory; note?: string; photo?: File }): Promise<Report> {
  await wait(500);
  if (i.photo && i.photo.size > 5 * 1024 * 1024) throw new ApiError('PHOTO_TOO_LARGE', 'Photo too large');
  const photo_url = i.photo ? URL.createObjectURL(i.photo) : null;
  return mutate((db) => { const r: Report = { id: uid(), lat: i.pos.lat, lng: i.pos.lng, segment_id: null, category: i.category, note: i.note ?? null, photo_url, created_at: new Date().toISOString(), confirm_count: 0, confirmed: false, is_mine: true, confirmed_by_me: false, simulated: false }; db.reports.unshift(r); return r; });
}
export async function confirmReport(report_id: string): Promise<void> {
  await wait();
  mutate((db) => {
    const r = db.reports.find((x) => x.id === report_id);
    if (!r) throw new ApiError('NOT_FOUND', 'Report not found');
    if (r.is_mine) throw new ApiError('OWN_REPORT', 'Cannot confirm your own report');
    if (r.confirmed_by_me) throw new ApiError('ALREADY_CONFIRMED', 'Already confirmed');
    r.confirm_count += 1; r.confirmed_by_me = true; r.confirmed = r.confirm_count >= CONFIRM_THRESHOLD;
  });
}

export function resetMockData() { localStorage.removeItem(LS); }
