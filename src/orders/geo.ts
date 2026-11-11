import { Logger } from '@nestjs/common';

export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6_371_000;
const rad = (d: number): number => (d * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough bounding box of Ghana (with a small margin). Orders must start and end inside it. */
export function isInGhana(p: LatLng): boolean {
  return p.lat >= 4.5 && p.lat <= 11.3 && p.lng >= -3.4 && p.lng <= 1.4;
}

export interface RoadEstimate {
  distanceMeters: number;
  durationSeconds: number;
  /** True when Mapbox was unavailable and a straight-line estimate was used. */
  estimated: boolean;
}

const logger = new Logger('RoadDistance');

/**
 * Road distance and time via Mapbox Directions (driving profile, closest to a motorbike).
 * Falls back to straight-line distance × 1.35 at ~22 km/h so quotes still work offline.
 */
export async function roadEstimate(
  from: LatLng,
  to: LatLng,
  fetchImpl: typeof fetch = (i, init) => globalThis.fetch(i, init),
  token: string | undefined = process.env.MAPBOX_ACCESS_TOKEN,
): Promise<RoadEstimate> {
  const fallback = (): RoadEstimate => {
    const d = Math.round(haversineMeters(from, to) * 1.35);
    return { distanceMeters: d, durationSeconds: Math.round(d / (22 / 3.6)), estimated: true };
  };
  if (!token) return fallback();
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${from.lng.toFixed(6)},${from.lat.toFixed(6)};${to.lng.toFixed(6)},${to.lat.toFixed(6)}` +
    `?overview=false&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      code?: string;
      routes?: { distance: number; duration: number }[];
    };
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route) throw new Error(data.code ?? 'no route');
    return {
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
      estimated: false,
    };
  } catch (err) {
    logger.warn(
      `Mapbox directions unavailable, using estimate: ${err instanceof Error ? err.message : String(err)}`,
    );
    return fallback();
  }
}
