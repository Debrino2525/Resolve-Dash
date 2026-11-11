import { placeDetails, placesAutocomplete } from '../api/backendClient';
import { Place, Point } from '../types/orders';
import { searchPlaces as mapboxSearch } from './mapbox';

export interface Suggestion {
  id: string;
  title: string;
  subtitle: string;
  /** Google/OSM results name a real place (shop, mall, junction); Mapbox ones are only an area. */
  precise: boolean;
  /** Known up front for OSM and Mapbox; Google needs a details lookup when chosen. */
  point: Point | null;
  address: string | null;
  /** Who found it (OpenStreetMap and HERE results must be credited on screen). */
  source: 'google' | 'osm' | 'here' | 'mapbox';
}

/** One token per search, shared by every keystroke and the final pick (cheaper Google billing). */
export function newSearchSession(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Search pickup/drop-off places through our server: OpenStreetMap (free, good coverage of Ghanaian
 * markets, malls, junctions and stops) or Google if configured there. Mapbox (areas only) is the
 * fallback when the server search is off or unreachable.
 */
export async function searchPlaces(query: string, near: Point | null, session: string): Promise<Suggestion[]> {
  try {
    const res = await placesAutocomplete(query, session, near);
    if (res.enabled) {
      const fallback = res.provider === 'google' ? 'google' : 'osm';
      return res.suggestions.map((s) => {
        const point =
          typeof s.lat === 'number' && typeof s.lng === 'number' ? { lat: s.lat, lng: s.lng } : null;
        const where = s.subtitle.includes(' · ') ? s.subtitle.split(' · ').slice(1).join(' · ') : s.subtitle;
        return {
          id: s.placeId,
          title: s.title,
          subtitle: s.subtitle,
          precise: true,
          point,
          address: point ? [s.title, where].filter(Boolean).join(', ') : null,
          source: s.source ?? fallback,
        };
      });
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
    source: 'mapbox' as const,
  }));
}

/** Coordinates and address for a chosen suggestion. */
export async function resolveSuggestion(s: Suggestion, session: string): Promise<Place> {
  if (s.point) return { ...s.point, address: s.address ?? s.title };
  const d = await placeDetails(s.id, session);
  return { lat: d.lat, lng: d.lng, address: d.address };
}
