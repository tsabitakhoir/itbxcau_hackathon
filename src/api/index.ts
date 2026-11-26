// API entry point (contract in context/be.md). FE imports only from here.
// - Routing, scores, heatmap: our own engine (src/core) over an OSM road graph, in the browser.
// - Users, contacts, trips, share links, SOS, reports, ratings: Supabase when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set,
//   otherwise this browser's localStorage (src/api/mock.ts, single device only).
import type { SegmentRating } from '../core/scoring';
import type { HeatPoint, LatLng, PlanResult, TravelMode } from '../core/types';
import * as engine from './engine';
import * as local from './mock';
import * as remote from './remote';

export const backend: 'supabase' | 'local' = remote.hasSupabase && import.meta.env.VITE_USE_MOCK !== 'true' ? 'supabase' : 'local';
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
export const createReport = R ? remote.createReport : local.createReport;
export const confirmReport = R ? remote.confirmReport : local.confirmReport;
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
const community: engine.Community = { reports: () => listReports(), ratings: R ? remote.segmentRatings : localRatings };

export function planRoutes(i: { origin: LatLng; destination: LatLng; departure_at: Date; mode?: TravelMode }): Promise<PlanResult> {
  return engine.planRoutes(i, community);
}
export function getActivityHeatmap(departure_at: Date): Promise<HeatPoint[]> {
  return engine.getActivityHeatmap(departure_at, community);
}
