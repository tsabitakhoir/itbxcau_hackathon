// Supabase backend (Postgres + anonymous auth + storage + RLS). Used when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
// Schema: supabase/migrations/0001_init.sql. Only the anon key is used here; RLS protects every table.
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIRM_THRESHOLD, DEMO_MODE, EMERGENCY_NUMBERS, LATE_GRACE_MIN } from '../core/config';
import type { SegmentRating } from '../core/scoring';
import {
  ApiError, type Country, type EmergencyContact, type LatLng, type PlanResult, type Profile, type Report, type ReportCategory, type RouteKind,
  type SharedTrip, type SosResult, type Trip, type TripStatus,
} from '../core/types';
import { segmentAt } from './engine';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const hasSupabase = !!(URL_ && KEY);
const BUCKET = 'report-photos';

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    if (!hasSupabase) throw new ApiError('NETWORK', 'Supabase is not configured');
    client = createClient(URL_!, KEY!, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return client;
}

function fail(e: PostgrestError | Error | null | unknown, fallback: string): never {
  const err = e as Partial<PostgrestError> & { message?: string };
  if (err?.code === '23505') throw new ApiError('ALREADY_CONFIRMED', 'Already confirmed');
  if (err?.code === '42501') throw new ApiError('OWN_REPORT', 'You cannot confirm your own report');
  if (err?.code === 'PGRST116') throw new ApiError('NOT_FOUND', 'Not found');
  throw new ApiError('NETWORK', err?.message ?? fallback);
}

let sessionUser: Promise<string> | null = null;
async function uid(): Promise<string> {
  sessionUser ??= (async () => {
    const { data } = await sb().auth.getSession();
    if (data.session) return data.session.user.id;
    const { data: d, error } = await sb().auth.signInAnonymously();
    if (error || !d.user) { sessionUser = null; throw new ApiError('NOT_AUTHENTICATED', error?.message ?? 'Sign-in failed'); }
    return d.user.id;
  })();
  return sessionUser;
}

// ---------- profile & contacts ----------
type ProfileRow = Profile & { created_at?: string };
const toProfile = (r: ProfileRow): Profile => ({ id: r.id, display_name: r.display_name, lang: r.lang, country: r.country, id_verified_mock: r.id_verified_mock, travel_mode: r.travel_mode ?? 'walk', voice_guidance: r.voice_guidance ?? false });

export async function ensureSession(): Promise<Profile> {
  const id = await uid();
  const { data, error } = await sb().from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) fail(error, 'Profile unavailable');
  if (data) return toProfile(data as ProfileRow);
  const { data: created, error: e2 } = await sb().from('profiles').insert({ id }).select().single(); // trigger missed (e.g. old user)
  if (e2) fail(e2, 'Profile unavailable');
  return toProfile(created as ProfileRow);
}
export async function updateProfile(p: Partial<Omit<Profile, 'id'>>): Promise<Profile> {
  const id = await uid();
  const { data, error } = await sb().from('profiles').update(p).eq('id', id).select().single();
  if (error) fail(error, 'Could not save profile');
  return toProfile(data as ProfileRow);
}
export async function listContacts(): Promise<EmergencyContact[]> {
  await uid();
  const { data, error } = await sb().from('emergency_contacts').select('id,name,phone,channel').order('created_at');
  if (error) fail(error, 'Contacts unavailable');
  return data as EmergencyContact[];
}
export async function addContact(c: Omit<EmergencyContact, 'id'>): Promise<EmergencyContact> {
  await uid();
  const { data, error } = await sb().from('emergency_contacts').insert(c).select('id,name,phone,channel').single();
  if (error) fail(error, 'Could not add contact');
  return data as EmergencyContact;
}
export async function deleteContact(id: string): Promise<void> {
  await uid();
  const { error } = await sb().from('emergency_contacts').delete().eq('id', id);
  if (error) fail(error, 'Could not delete contact');
}

// ---------- trips ----------
type TripRow = { id: string; status: TripStatus; chosen: RouteKind; departure_at: string; started_at: string; eta: string; arrived_at: string | null; share_token: string; route_options: { fastest: Trip['route']; safest: Trip['route'] }; destination: Trip['destination'] };
const shareUrl = (token: string) => `${location.origin}/t/${token}`;
const toTrip = (r: TripRow): Trip => ({ id: r.id, status: r.status, chosen: r.chosen, departure_at: r.departure_at, started_at: r.started_at, eta: r.eta, arrived_at: r.arrived_at, share_token: r.share_token, share_url: shareUrl(r.share_token), route: r.route_options[r.chosen], destination: r.destination });

export async function startTrip(i: { origin: LatLng & { label: string }; destination: LatLng & { label: string }; plan: PlanResult; chosen: RouteKind }): Promise<Trip> {
  await uid();
  const route = i.plan[i.chosen];
  const eta = new Date(Date.now() + route.duration_s * 1000).toISOString();
  const { data, error } = await sb().from('trips').insert({
    graph_version: i.plan.graph_version, origin: i.origin, destination: i.destination, departure_at: i.plan.departure_at, chosen: i.chosen,
    mode: i.plan.mode ?? 'walk', route_options: { fastest: i.plan.fastest, safest: i.plan.safest }, eta,
  }).select().single();
  if (error) fail(error, 'Could not start trip');
  const trip = toTrip(data as TripRow);
  await sb().from('trip_locations').insert({ trip_id: trip.id, lat: i.origin.lat, lng: i.origin.lng });
  return trip;
}
export async function getTrip(id: string): Promise<Trip> {
  await uid();
  const { data, error } = await sb().from('trips').select('*').eq('id', id).maybeSingle();
  if (error) fail(error, 'Trip unavailable');
  if (!data) throw new ApiError('NOT_FOUND', 'Trip not found');
  return toTrip(data as TripRow);
}

// offline queue: failed pushes are retried with the next one
const pending: { trip_id: string; lat: number; lng: number; accuracy_m?: number; recorded_at: string }[] = [];
export async function pushLocation(trip_id: string, p: LatLng & { accuracy_m?: number }): Promise<void> {
  await uid();
  pending.push({ trip_id, lat: p.lat, lng: p.lng, accuracy_m: p.accuracy_m, recorded_at: new Date().toISOString() });
  const batch = pending.splice(0, pending.length);
  const { error } = await sb().from('trip_locations').insert(batch);
  if (error) { pending.unshift(...batch.slice(-20)); throw new ApiError('NETWORK', 'Location will be sent when back online'); }
}
export async function finishTrip(trip_id: string, status: 'arrived' | 'cancelled'): Promise<void> {
  await uid();
  const { error } = await sb().from('trips').update({ status, arrived_at: status === 'arrived' ? new Date().toISOString() : null }).eq('id', trip_id);
  if (error) fail(error, 'Could not finish trip');
}
export async function rateTrip(trip_id: string, rating: 1 | 2 | 3 | 4 | 5, comment?: string): Promise<void> {
  await uid();
  const { error } = await sb().from('trips').update({ rating, rating_comment: comment ?? null }).eq('id', trip_id);
  if (error) fail(error, 'Could not save rating');
}
export async function getSharedTrip(token: string): Promise<SharedTrip> {
  const { data, error } = await sb().rpc('get_shared_trip', { p_token: token });
  if (error) fail(error, 'Shared trip unavailable');
  if (!data) throw new ApiError('NOT_FOUND', 'Unknown or expired link');
  const t = data as Omit<SharedTrip, 'is_late'>;
  return { ...t, is_late: t.status === 'active' && Date.now() > new Date(t.eta).getTime() + LATE_GRACE_MIN * 60e3 };
}

// ---------- SOS ----------
export async function triggerSos(i: { trip_id?: string; pos: LatLng | null; country: Country }): Promise<SosResult> {
  await uid();
  const number = EMERGENCY_NUMBERS[i.country];
  const { data, error } = await sb().from('sos_events').insert({ trip_id: i.trip_id ?? null, lat: i.pos?.lat ?? null, lng: i.pos?.lng ?? null, country: i.country, number_called: number, is_demo: DEMO_MODE }).select('id').single();
  if (error) fail(error, 'SOS could not be saved');
  let share: string | null = null;
  if (i.trip_id) {
    const { data: t } = await sb().from('trips').update({ status: 'sos' }).eq('id', i.trip_id).select('share_token').single();
    if (t) share = shareUrl((t as { share_token: string }).share_token);
  }
  const map = i.pos ? ` https://maps.google.com/?q=${i.pos.lat},${i.pos.lng}` : '';
  return { sos_id: (data as { id: string }).id, tel_uri: `tel:${number}`, share_text: `SOS! I need help. My location:${map}${share ? ` Live: ${share}` : ''}`, share_url: share, demo: DEMO_MODE };
}
export async function resolveSos(sos_id: string): Promise<void> {
  await uid();
  const { data, error } = await sb().from('sos_events').update({ resolved_at: new Date().toISOString() }).eq('id', sos_id).select('trip_id').single();
  if (error) fail(error, 'Could not resolve SOS');
  const tripId = (data as { trip_id: string | null }).trip_id;
  if (tripId) await sb().from('trips').update({ status: 'active' }).eq('id', tripId).eq('status', 'sos');
}

// ---------- reports ----------
type ReportRow = { id: string; lat: number; lng: number; segment_id: number | null; category: ReportCategory; note: string | null; photo_path: string | null; created_at: string; confirm_count: number; is_mine: boolean; confirmed_by_me: boolean; is_simulated: boolean };
const photoUrl = (path: string | null) => (path ? sb().storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null);
const toReport = (r: ReportRow): Report => ({ id: r.id, lat: r.lat, lng: r.lng, segment_id: r.segment_id, category: r.category, note: r.note, photo_url: photoUrl(r.photo_path), created_at: r.created_at, confirm_count: r.confirm_count, confirmed: r.confirm_count >= CONFIRM_THRESHOLD, is_mine: !!r.is_mine, confirmed_by_me: !!r.confirmed_by_me, simulated: r.is_simulated });

export async function listReports(): Promise<Report[]> {
  await uid();
  const { data, error } = await sb().from('reports_public').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) fail(error, 'Reports unavailable');
  return (data as ReportRow[]).map(toReport);
}

/** Resize to max 1280 px JPEG (~300 KB) before upload. */
async function compress(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    for (const q of [0.8, 0.6, 0.45]) {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q));
      if (blob && blob.size <= 600_000) return blob;
    }
  } catch { /* fall through */ }
  if (file.size <= 5 * 1024 * 1024) return file;
  throw new ApiError('PHOTO_TOO_LARGE', 'Photo is too large');
}

export async function createReport(i: { pos: LatLng; category: ReportCategory; note?: string; photo?: File }): Promise<Report> {
  const user = await uid();
  let photo_path: string | null = null;
  if (i.photo) {
    const blob = await compress(i.photo);
    photo_path = `${user}/${crypto.randomUUID()}.jpg`;
    const { error } = await sb().storage.from(BUCKET).upload(photo_path, blob, { contentType: 'image/jpeg' });
    if (error) fail(error, 'Photo upload failed');
  }
  const seg = await segmentAt(i.pos).catch(() => ({ segment_id: null, graph_version: 'none' }));
  const { data, error } = await sb().from('reports').insert({ lat: i.pos.lat, lng: i.pos.lng, category: i.category, note: i.note ?? null, photo_path, segment_id: seg.segment_id, graph_version: seg.graph_version }).select('id').single();
  if (error) fail(error, 'Could not save report');
  const { data: row } = await sb().from('reports_public').select('*').eq('id', (data as { id: string }).id).single();
  return toReport(row as ReportRow);
}

export async function confirmReport(report_id: string): Promise<void> {
  await uid();
  const { error } = await sb().from('report_confirmations').insert({ report_id });
  if (error) fail(error, 'Could not confirm');
}

export async function segmentRatings(): Promise<SegmentRating[]> {
  const { data, error } = await sb().from('segment_ratings').select('*');
  if (error) return [];
  return data as SegmentRating[];
}
