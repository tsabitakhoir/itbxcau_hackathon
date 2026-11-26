// Shared BE+FE contract (fe.md). Change only by BE+FE agreement.
export const APP_NAME = 'GIL:ON'; // name from the Figma design
// Bobot skor keamanan (konsep 26 Nov). Jumlah = 1. Skor = 1 + 4 * Σ bobot * faktor (1-5, UI: x20 = pts).
export const SCORE_WEIGHTS = { lighting: 0.30, facilities: 0.25, crowd: 0.20, reports: 0.25 };
// Wheelchair mode: rute teraman menghindari tangga; ruas curam/sempit diberi penalti.
export const WHEELCHAIR = {
  avoid_steps: true, steep_incline_pct: 8, narrow_width_m: 1.2,
  speed_mps: 0.9,      // durasi rute kursi roda
  // batasan keras (ruas dibuang); kalau tidak ada rute tanpa ruas ini, dipakai dengan penalti dan wheelchair_ok = false
  bad_surfaces: ['gravel', 'fine_gravel', 'pebblestone', 'dirt', 'earth', 'ground', 'grass', 'mud', 'sand', 'unpaved', 'rock', 'stepping_stones', 'woodchips'],
  bad_smoothness: ['bad', 'very_bad', 'horrible', 'very_horrible', 'impassable'],
  fallback_penalty: 50,
};
export const LIT_VALUE = { yes: 1, partial: 0.6, no: 0.15, unknown: 0.5 };
export const ROAD_ACTIVITY = { primary: 1, secondary: 0.85, tertiary: 0.7, residential: 0.5, footway: 0.4, path: 0.3, alley: 0.2 };
// Faktor jam untuk aktivitas: [jamMulai, jamSelesai, faktor]
export const HOUR_FACTOR: [number, number, number][] = [[5,7,0.5],[7,17,0.9],[17,20,1],[20,22,0.8],[22,24,0.55],[0,2,0.35],[2,5,0.2]];
export const POI_RADIUS_M = 60;
export const HELP_WEIGHTS = { police: 1.0, health: 0.6, shop24: 0.6, shop: 0.5, bus_stop: 0.3, cctv: 0.3 };
export const UNKNOWN_HOURS_FACTOR = 0.5;     // POI tanpa jam buka di OSM dihitung setengah (OSM Bandung jarang punya opening_hours)
export const LIT_ESTIMATE = { primary: 0.85, secondary: 0.8, tertiary: 0.65, residential: 0.45, footway: 0.4, path: 0.3, alley: 0.25 }; // kalau tag lit tidak ada
export const DARK_REPORT_LIGHT_PENALTY = 0.25; // laporan 'dark'/'broken_light' terkonfirmasi juga menurunkan pencahayaan ruas
export const REPORT_SNAP_M = 40;             // laporan memengaruhi ruas dalam radius ini
export const HELP_SATURATION = 1.5;          // total bobot bantuan yang dianggap "penuh"
export const ACTIVITY_PER_OPEN_POI = 0.08;
export const REPORT_PENALTY = { harassment: 0.35, dark: 0.2, broken_light: 0.2, deserted: 0.15, other: 0.1 };
export const MAX_COMMUNITY_PENALTY = 0.6;
export const REPORT_HALF_LIFE_DAYS = 14;
export const CONFIRM_THRESHOLD = 3;          // untuk demo boleh 2
export const SAFETY_ALPHA = 3;               // seberapa kuat rute teraman menghindari ruas berskor rendah
export const MAX_DETOUR_RATIO = 1.6;         // rute teraman maksimal 1,6x durasi rute tercepat
export const WALK_SPEED_MPS = 1.25;          // sekitar 75 m per menit
export const SNAP_MAX_M = 300;               // lebih jauh dari ini: OUT_OF_AREA
export const SCORE_BANDS = { safe: 4.0, caution: 2.5 }; // >=4 hijau, 2.5-3.9 kuning, <2.5 merah
export const HEATMAP_STEP_M = 30;
export const LATE_GRACE_MIN = 5;
export const LOCATION_PUSH_SEC = 10;
export const SHARED_POLL_SEC = 5;
export const EMERGENCY_NUMBERS = { ID: '110', KR: '112' } as const;
export const DEMO_MODE = import.meta.env?.VITE_DEMO_MODE === 'true'; // true: SOS tidak benar-benar menelepon
