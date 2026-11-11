import { placeDetails, placesAutocomplete } from '../api/backendClient';
import { Place, Point } from '../types/orders';
import { searchPlaces as mapboxSearch } from './mapbox';

export interface Suggestion {
  id: string;
  title: string;
  subtitle: string;
  /** Google results name a real place (shop, mall, junction); Mapbox ones are only an area. */
  precise: boolean;
  /** Known up front for Mapbox; Google needs a details lookup when chosen. */
  point: Point | null;
  address: string | null;
}

/** One token per search, shared by every keystroke and the final pick (cheaper Google billing). */
export function newSearchSession(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Search pickup/drop-off places. Uses Google Places through our server when it is configured
 * (good coverage of Ghanaian businesses and landmarks), otherwise Mapbox (areas only).
 */
export async function searchPlaces(query: string, near: Point | null, session: string): Promise<Suggestion[]> {
  try {
    const res = await placesAutocomplete(query, session, near);
    if (res.enabled) {
      return res.suggestions.map((s) => ({
        id: s.placeId,
        title: s.title,
        subtitle: s.subtitle,
        precise: true,
        point: null,
        address: null,
      }));
    }
  } catch {
    // Google search unavailable right now: fall back to Mapbox below.
  }
  const fallback = await mapboxSearch(query, near);
  return fallback.map((s) => ({
    id: s.id,
    title: s.title,
    subtitle: s.subtitle,
    precise: false,
    point: { lat: s.lat, lng: s.lng },
    address: s.address,
  }));
}

/** Coordinates and address for a chosen suggestion. */
export async function resolveSuggestion(s: Suggestion, session: string): Promise<Place> {
  if (s.point) return { ...s.point, address: s.address ?? s.title };
  const d = await placeDetails(s.id, session);
  return { lat: d.lat, lng: d.lng, address: d.address };
}
