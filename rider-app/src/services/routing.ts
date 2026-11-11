import { decodePolyline } from '../utils/polyline';
import { LatLng } from './location';

export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

export interface RoadRoute {
  /** Full road geometry through every waypoint. */
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  /** One entry per leg (e.g. rider→pickup, pickup→drop-off). */
  legs: { distanceMeters: number; durationSeconds: number }[];
}

interface MapboxDirectionsResponse {
  code: string;
  message?: string;
  routes?: {
    geometry: string;
    distance: number;
    duration: number;
    legs: { distance: number; duration: number }[];
  }[];
}

/**
 * Road route through the given points via Mapbox Directions (driving profile, the closest to a
 * motorbike). Returns null when there's no token, no route, or the network fails, so callers can
 * fall back to a straight line.
 */
export async function fetchRoadRoute(
  points: LatLng[],
  fetchImpl: typeof fetch = fetch,
): Promise<RoadRoute | null> {
  if (!MAPBOX_TOKEN || points.length < 2) return null;
  const coords = points.map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(';');
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?overview=full&geometries=polyline6&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;

  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const data = (await res.json()) as MapboxDirectionsResponse;
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route) return null;
    return {
      coordinates: decodePolyline(route.geometry, 6),
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      legs: route.legs.map((l) => ({ distanceMeters: l.distance, durationSeconds: l.duration })),
    };
  } catch {
    return null;
  }
}

// ---------- Turn-by-turn (in-app navigation) ----------

export interface NavVoice {
  /** Speak when this many metres remain to the end of the step (the next manoeuvre). */
  distanceAlongGeometry: number;
  announcement: string;
}

export interface NavBanner {
  text: string;
  type: string;
  modifier?: string;
}

export interface NavStep {
  /** Instruction for the manoeuvre that STARTS this step (e.g. "Turn right onto X"). */
  instruction: string;
  type: string;
  modifier?: string;
  /** Road this step travels along. */
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  geometry: LatLng[];
  /** Announcements made while on this step, about the NEXT manoeuvre. */
  voice: NavVoice[];
  /** Banner for the NEXT manoeuvre, shown while on this step. */
  banner: NavBanner | null;
}

export interface NavRoute {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  steps: NavStep[];
}

interface MapboxNavResponse {
  code: string;
  routes?: {
    geometry: string;
    distance: number;
    duration: number;
    legs: {
      steps: {
        name: string;
        distance: number;
        duration: number;
        geometry: string;
        maneuver: { type: string; modifier?: string; instruction: string };
        voiceInstructions?: { distanceAlongGeometry: number; announcement: string }[];
        bannerInstructions?: { primary: { text: string; type: string; modifier?: string } }[];
      }[];
    }[];
  }[];
}

/** Turn-by-turn route (steps, banners, voice prompts) from origin to destination. */
export async function fetchNavigationRoute(
  origin: LatLng,
  destination: LatLng,
  fetchImpl: typeof fetch = fetch,
): Promise<NavRoute | null> {
  if (!MAPBOX_TOKEN) return null;
  const coords = [origin, destination]
    .map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`)
    .join(';');
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    '?overview=full&geometries=polyline6&steps=true&voice_instructions=true' +
    '&banner_instructions=true&voice_units=metric&language=en' +
    `&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const data = (await res.json()) as MapboxNavResponse;
    const route = data.routes?.[0];
    if (data.code !== 'Ok' || !route) return null;
    const steps: NavStep[] = route.legs.flatMap((leg) =>
      leg.steps.map((s) => ({
        instruction: s.maneuver.instruction,
        type: s.maneuver.type,
        modifier: s.maneuver.modifier,
        name: s.name,
        distanceMeters: s.distance,
        durationSeconds: s.duration,
        geometry: decodePolyline(s.geometry, 6),
        voice: (s.voiceInstructions ?? []).map((v) => ({
          distanceAlongGeometry: v.distanceAlongGeometry,
          announcement: v.announcement,
        })),
        banner: s.bannerInstructions?.[0]?.primary ?? null,
      })),
    );
    return {
      coordinates: decodePolyline(route.geometry, 6),
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      steps,
    };
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

/**
 * Optional Mapbox dark raster tiles for react-native-maps <UrlTile>, enabled only with
 * EXPO_PUBLIC_MAP_TILES=mapbox. Off by default: raster tiles bake labels into images, so they
 * turn sideways when the map rotates to the rider's heading in navigation, and on iOS they can
 * cover the route line. The native dark maps (Apple/Google) keep labels upright. For full Mapbox
 * vector maps, use @rnmapbox/maps in a development build.
 */
export function mapboxTileUrl(): string | null {
  if (!MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAP_TILES !== 'mapbox') return null;
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;
}
