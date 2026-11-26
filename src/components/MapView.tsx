import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { HeatLayer as LeafletHeat } from 'leaflet.heat';
import { useEffect, type ReactNode } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { HeatPoint, LatLng } from '../core/types';

export const ITB_CENTER: [number, number] = [-6.8905, 107.6125];

export function MapView({ children, center = ITB_CENTER, zoom = 16, className = '' }: { children?: ReactNode; center?: [number, number]; zoom?: number; className?: string }) {
  return (
    <MapContainer center={center} zoom={zoom} zoomControl={false} className={`h-full w-full ${className}`} attributionControl>
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      {children}
    </MapContainer>
  );
}

export function HeatLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const c = (n: string) => `rgb(${css.getPropertyValue(n).trim().split(/\s+/).join(',')})`;
    const layer = new LeafletHeat(points, { radius: 22, blur: 18, minOpacity: 0.25, gradient: { 0.2: c('--color-primary'), 0.5: c('--color-caution-line'), 0.9: c('--color-safe-line') } }) as unknown as L.Layer; layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, points]);
  return null;
}

/** Fit the map to points. `top`/`bottom` add extra padding for overlays (cards, bottom sheets). */
export function FitBounds({ points, top = 40, bottom = 40 }: { points: [number, number][]; top?: number; bottom?: number }) {
  const map = useMap();
  const key = points.length ? `${points.length}:${points[0].join(',')}:${points[points.length - 1].join(',')}:${top}:${bottom}` : '';
  useEffect(() => { if (points.length > 1) map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [40, top], paddingBottomRight: [40, bottom] }); }, [map, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function FollowPos({ pos }: { pos: LatLng | null }) {
  const map = useMap();
  useEffect(() => { if (pos) map.panTo([pos.lat, pos.lng], { animate: true }); }, [map, pos]);
  return null;
}

/** Read a token as a CSS color string for Leaflet path options. */
export function token(name: string, alpha = 1) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim().split(/\s+/).join(',');
  return `rgba(${v},${alpha})`;
}
