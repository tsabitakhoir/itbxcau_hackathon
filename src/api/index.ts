// API entry point (contract in context/be.md). FE imports only from here.
// - Routing, scores, heatmap: our own engine (src/core) over an OSM road graph, in the browser.
// - Users, contacts, trips, share links, SOS, reports, ratings: Supabase when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set,
//   otherwise this browser's localStorage (src/api/mock.ts, single device only).
import type { SegmentRating } from '../core/scoring';
import type { DepartureMode, HeatPoint, LatLng, PlanResult, Report, TravelMode } from '../core/types';
import * as engine from './engine';
import * as local from './mock';
import type * as Remote from './remote';

// Supabase client (~170 KB) is loaded only when a Supabase project is configured.
const hasSupabase = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
export const backend: 'supabase' | 'local' = hasSupabase && import.meta.env.VITE_USE_MOCK !== 'true' ? 'supabase' : 'local';
let remoteMod: Promise<typeof Remote> | null = null;
const loadRemote = () => (remoteMod ??= import('./remote'));
type Fns = { [K in keyof typeof Remote]: (typeof Remote)[K] extends (...a: infer A) => infer Ret ? (...a: A) => Ret : never };
const remote = new Proxy({} as Fns, {
  get: (_t, name: string) => (...args: unknown[]) => loadRemote().then((m) => (m as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args)),
});
const R = backend === 'supabase';

export const ensureSession = R ? remote.ensureSession : local.ensureSession;
export const updateProfile = R ? remote.updateProfile : local.updateProfile;
export const listContacts = R ? remote.listContacts : local.listContacts;
export const addContact = R ? remote.addContact : local.addContact;
export const deleteContact = R ? remote.deleteContact : local.deleteContact;
export const startTrip = R ? remote.startTrip : local.startTrip;
export const getTrip = R ? remote.getTrip : local.getTrip;
export const pushLocation = R ? remote.pushLocation : local.pushLocation;
export const finishTrip = R ? remote.finishTrip : local.finishTrip;
export const rateTrip = R ? remote.rateTrip : local.rateTrip;
export const getSharedTrip = R ? remote.getSharedTrip : local.getSharedTrip;
export const triggerSos = R ? remote.triggerSos : local.triggerSos;
export const resolveSos = R ? remote.resolveSos : local.resolveSos;
export const listReports = R ? remote.listReports : local.listReports;
export const createReport: typeof local.createReport = (i) => { reportsCache = null; return (R ? remote.createReport : local.createReport)(i); };
export const confirmReport: typeof local.confirmReport = async (id) => { reportsCache = null; await (R ? remote.confirmReport : local.confirmReport)(id); reportsCache = null; };
export const resetMockData = local.resetMockData;
export { loadGraph } from './engine';
export { listPlaces, searchPlaces } from './places';

/** Ratings stored on this device (local mode): average per segment of rated trips. */
async function localRatings(): Promise<SegmentRating[]> {
  try {
    const db = JSON.parse(localStorage.getItem('gil-mock-v1') ?? '{}') as { trips?: { id: string; route: { segment_ids: number[] } }[]; ratings?: Record<string, number> };
    const acc = new Map<number, { s: number; n: number }>();
    for (const t of db.trips ?? []) {
      const r = db.ratings?.[t.id]; if (!r) continue;
      for (const id of new Set(t.route.segment_ids)) { const a = acc.get(id) ?? { s: 0, n: 0 }; a.s += r; a.n++; acc.set(id, a); }
    }
    return [...acc].map(([segment_id, a]) => ({ segment_id, avg_rating: a.s / a.n, n: a.n }));
  } catch { return []; }
}
// Community data changes slowly: reuse it for 20 s so planning a route does not wait on the network every time.
let reportsCache: { at: number; p: Promise<Report[]> } | null = null;
let ratingsCache: { at: number; p: Promise<SegmentRating[]> } | null = null;
const FRESH_MS = 20_000;
function cachedReports() {
  if (!reportsCache || Date.now() - reportsCache.at > FRESH_MS) { const p = listReports(); reportsCache = { at: Date.now(), p }; p.catch(() => { reportsCache = null; }); }
  return reportsCache.p;
}
function cachedRatings() {
  if (!ratingsCache || Date.now() - ratingsCache.at > FRESH_MS) { const p = (R ? remote.segmentRatings : localRatings)(); ratingsCache = { at: Date.now(), p }; p.catch(() => { ratingsCache = null; }); }
  return ratingsCache.p;
}
const community: engine.Community = { reports: cachedReports, ratings: cachedRatings };

// Start downloading and preparing the ITB road graph shortly after the app opens.
if (typeof window !== 'undefined') window.setTimeout(engine.warmUp, 300);

export function planRoutes(i: { origin: LatLng; destination: LatLng; departure_at: Date; departure_mode?: DepartureMode; mode?: TravelMode }): Promise<PlanResult> {
  return engine.planRoutes(i, community);
}
export function getActivityHeatmap(departure_at: Date): Promise<HeatPoint[]> {
  return engine.getActivityHeatmap(departure_at, community);
}
