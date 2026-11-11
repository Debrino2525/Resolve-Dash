import { Place, Point } from '../types/orders';
import { decodePolyline } from '../utils/polyline';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

interface GeocodeFeature {
  id?: string;
  properties: {
    mapbox_id?: string;
    name?: string;
    full_address?: string;
    place_formatted?: string;
    coordinates?: { longitude: number; latitude: number };
  };
  geometry?: { coordinates: [number, number] };
}

export interface PlaceSuggestion extends Place {
  id: string;
  title: string;
  subtitle: string;
}

function toSuggestion(f: GeocodeFeature, i: number): PlaceSuggestion | null {
  const c = f.properties.coordinates ?? (f.geometry && { longitude: f.geometry.coordinates[0], latitude: f.geometry.coordinates[1] });
  if (!c) return null;
  const title = f.properties.name ?? f.properties.full_address ?? 'Unnamed place';
  const subtitle = f.properties.place_formatted ?? '';
  return {
    id: f.properties.mapbox_id ?? f.id ?? String(i),
    title,
    subtitle,
    address: f.properties.full_address ?? [title, subtitle].filter(Boolean).join(', '),
    lat: c.latitude,
    lng: c.longitude,
  };
}

/** Address / area search in Ghana, biased towards the customer's position. */
export async function searchPlaces(query: string, near: Point | null): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (!TOKEN || q.length < 2) return [];
  const params = new URLSearchParams({
    q,
    country: 'gh',
    limit: '6',
    language: 'en',
    autocomplete: 'true',
    access_token: TOKEN,
  });
  if (near) params.set('proximity', `${near.lng},${near.lat}`);
  try {
    const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: GeocodeFeature[] };
    return (data.features ?? []).map(toSuggestion).filter((s): s is PlaceSuggestion => s !== null);
  } catch {
    return [];
  }
}

/** Nearest street/area name for a map point; falls back to the coordinates. */
export async function reverseGeocode(p: Point): Promise<string> {
  const fallback = `Pinned location (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`;
  if (!TOKEN) return fallback;
  const params = new URLSearchParams({
    longitude: String(p.lng),
    latitude: String(p.lat),
    limit: '1',
    language: 'en',
    access_token: TOKEN,
  });
  try {
    const res = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${params.toString()}`);
    if (!res.ok) return fallback;
    const data = (await res.json()) as { features?: GeocodeFeature[] };
    const f = data.features?.[0];
    return f?.properties.full_address ?? f?.properties.name ?? fallback;
  } catch {
    return fallback;
  }
}

/** Road geometry between two points for drawing on the map (null if unavailable). */
export async function fetchRouteLine(a: Point, b: Point): Promise<{ latitude: number; longitude: number }[] | null> {
  if (!TOKEN) return null;
  const coords = `${a.lng.toFixed(6)},${a.lat.toFixed(6)};${b.lng.toFixed(6)},${b.lat.toFixed(6)}`;
  try {
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?overview=full&geometries=polyline6&access_token=${encodeURIComponent(TOKEN)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { code: string; routes?: { geometry: string }[] };
    const g = data.routes?.[0]?.geometry;
    return data.code === 'Ok' && g ? decodePolyline(g, 6) : null;
  } catch {
    return null;
  }
}

/** "4 min", "1 h 12 min" */
export function formatDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}
