// Destinations: curated pilot places from the graph + explicit-submit geocoding (Nominatim, not autocomplete).
import { distLL } from '../core/geo';
import { ITB_PLACES } from '../core/osm';
import { ApiError, type Place } from '../core/types';

const GEOCODE_CACHE_MS = 24 * 60 * 60_000;

/** The 8 pilot destinations are a fixed list: no need to wait for the 2 MB road graph. */
export async function listPlaces(): Promise<Place[]> {
  return ITB_PLACES;
}

async function requestJson<T>(url: string): Promise<T> {
  const controller = new AbortController(); const timer = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as T;
  } finally { window.clearTimeout(timer); }
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 3) return [];
  const local = ITB_PLACES.filter((p) => [p.name_en, p.name_id, p.name_ko].some((n) => n?.toLowerCase().includes(normalized)));
  const cacheKey = `gil-geocode:${normalized}`;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) { const cached = JSON.parse(raw) as { at: number; places: Place[] }; if (Date.now() - cached.at < GEOCODE_CACHE_MS) return [...local, ...cached.places]; }
  } catch { /* fetch a fresh result */ }
  const throttleKey = 'gil-geocode:last-request';
  let last = 0;
  try { last = Number(localStorage.getItem(throttleKey) ?? 0); } catch { /* best effort */ }
  const waitMs = Math.max(0, 1_100 - (Date.now() - last)); // Nominatim policy: max 1 request / second
  if (waitMs) await new Promise((resolve) => window.setTimeout(resolve, waitMs));
  try { localStorage.setItem(throttleKey, String(Date.now())); } catch { /* best effort */ }
  const params = new URLSearchParams({ q: `${query.trim()}, Bandung, Indonesia`, format: 'jsonv2', limit: '8', countrycodes: 'id', viewbox: '107.55,-6.84,107.70,-6.96', addressdetails: '0' });
  try {
    const results = await requestJson<{ place_id: number; name?: string; display_name: string; lat: string; lon: string }[]>(`https://nominatim.openstreetmap.org/search?${params}`);
    const places = results.map((item) => {
      const name = item.name || item.display_name.split(',')[0];
      return { id: -Math.abs(item.place_id), name_en: name, name_id: name, name_ko: name, display_name: item.display_name, lat: Number(item.lat), lng: Number(item.lon) };
    }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && distLL(p, { lat: -6.8905, lng: 107.6125 }) < 50_000);
    try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), places })); } catch { /* optional */ }
    return [...local, ...places];
  } catch {
    if (local.length) return local;
    throw new ApiError('NETWORK', 'Place search is temporarily unavailable. Please try again.');
  }
}
