// Shared BE+FE contract (fe.md). Change only by BE+FE agreement.
// NOTE(FE): Lang adds 'en' because the Figma design uses English copy.
export type LatLng = { lat: number; lng: number };
export type Lang = 'en' | 'id' | 'ko';
export type Country = 'ID' | 'KR';
export type RouteKind = 'fastest' | 'safest';
export type Factors = { lighting: number; activity: number; help_access: number; community_penalty: number }; // 0..1
export type ReasonCode =
  | 'OPEN_PLACES'       // {count} toko/tempat buka saat waktu berangkat
  | 'POLICE_NEAR'       // {count}
  | 'LIT_PCT'           // {pct} persen panjang rute terang
  | 'BUSY_PCT'          // {pct} persen panjang rute dengan aktivitas >= 0.6
  | 'CONFIRMED_REPORTS' // {count}
  | 'DARK_STRETCH'      // {meters, name} ruas gelap terpanjang >= 50 m
  | 'QUIET_STRETCH'     // {meters, name} ruas sepi terpanjang >= 50 m
  | 'DATA_LIMITED';     // lebih dari 30% panjang rute lit = unknown
export type Reason = { code: ReasonCode; tone: 'good' | 'warn' | 'bad' | 'info'; count?: number; pct?: number; meters?: number; name?: string | null };
export type RouteOption = {
  kind: RouteKind; segment_ids: number[]; geometry: [number, number][];
  length_m: number; duration_s: number; score: number; // 1.0-5.0, satu desimal
  factors: Factors; reasons: Reason[];
  worst_segment: { id: number; name: string | null; score: number } | null; // hanya jika score < SCORE_BANDS.caution
  data_limited: boolean;
};
export type PlanResult = { fastest: RouteOption; safest: RouteOption; same_route: boolean; extra_minutes: number; departure_at: string; graph_version: string; simulated: true };
export type HeatPoint = [number, number, number]; // [lat, lng, intensitas 0..1]
export type Profile = { id: string; display_name: string; lang: Lang; country: Country; id_verified_mock: boolean };
export type EmergencyContact = { id: string; name: string; phone: string; channel: 'whatsapp' | 'kakao' | 'sms' };
export type TripStatus = 'active' | 'arrived' | 'sos' | 'cancelled';
export type Trip = { id: string; status: TripStatus; chosen: RouteKind; departure_at: string; started_at: string; eta: string; arrived_at: string | null; share_token: string; share_url: string; route: RouteOption; destination: { label: string; lat: number; lng: number } };
export type SharedTrip = { status: TripStatus; display_name: string; destination_label: string; eta: string; is_late: boolean; route_geometry: [number, number][]; last_location: { lat: number; lng: number; recorded_at: string } | null; sos: { created_at: string; lat: number | null; lng: number | null } | null };
export type ReportCategory = 'dark' | 'deserted' | 'harassment' | 'broken_light' | 'other';
export type Report = { id: string; lat: number; lng: number; segment_id: number | null; category: ReportCategory; note: string | null; photo_url: string | null; created_at: string; confirm_count: number; confirmed: boolean; is_mine: boolean; confirmed_by_me: boolean; simulated: boolean };
export type SosResult = { sos_id: string; tel_uri: string; share_text: string; share_url: string | null; demo: boolean };
export type ApiErrorCode = 'OUT_OF_AREA' | 'NO_ROUTE' | 'NOT_AUTHENTICATED' | 'ALREADY_CONFIRMED' | 'OWN_REPORT' | 'PHOTO_TOO_LARGE' | 'NOT_FOUND' | 'TRIP_ENDED' | 'NETWORK';
export class ApiError extends Error { code: ApiErrorCode; constructor(code: ApiErrorCode, message: string) { super(message); this.code = code; } }

// Graph types (public/data/bandung-graph.json)
export type Place = { id: number; name_id: string; name_ko: string; name_en?: string; lat: number; lng: number };
export type Graph = { version: string; city: string; simulated: boolean; bbox: [number, number, number, number]; nodes: { id: number; lat: number; lng: number }[]; segments: unknown[]; pois: unknown[]; places: Place[] };
