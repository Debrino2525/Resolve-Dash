import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

/**
 * Place search for pickup/drop-off, proxied to Google Places API (New) so the API key never ships
 * inside the apps and usage can be rate-limited per user. Results are restricted to Ghana and
 * biased towards the customer's position. The apps still make the customer confirm the exact
 * spot on a map afterwards.
 *
 * Billing: Google charges autocomplete per "session" when the same sessionToken is passed to
 * autocomplete calls and the final details call, so the app sends one token per search.
 */

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_URL = 'https://places.googleapis.com/v1/places/';
const BIAS_RADIUS_M = 30_000;

export interface PlaceSuggestion {
  placeId: string;
  title: string;
  subtitle: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface AutocompleteResponse {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    };
  }[];
}

interface DetailsResponse {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
}

const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;
const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  /** Replaceable in tests. */
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init);

  /** True when GOOGLE_PLACES_API_KEY is set; otherwise the apps fall back to Mapbox. */
  get enabled(): boolean {
    return Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
  }

  async autocomplete(
    input: string,
    sessionToken: string,
    near: { lat: number; lng: number } | null,
  ): Promise<{ enabled: boolean; suggestions: PlaceSuggestion[] }> {
    if (!this.enabled) return { enabled: false, suggestions: [] };
    const q = input.trim();
    if (q.length < 2) return { enabled: true, suggestions: [] };
    if (q.length > 120) throw new BadRequestException('Search text is too long');
    if (!SESSION_RE.test(sessionToken)) throw new BadRequestException('Invalid search session');

    const body: Record<string, unknown> = {
      input: q,
      includedRegionCodes: ['gh'],
      languageCode: 'en',
      sessionToken,
    };
    if (near) {
      body.locationBias = {
        circle: { center: { latitude: near.lat, longitude: near.lng }, radius: BIAS_RADIUS_M },
      };
    }
    const data = await this.call<AutocompleteResponse>(AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const suggestions = (data.suggestions ?? [])
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
      .slice(0, 6)
      .map((p) => ({
        placeId: p.placeId as string,
        title: p.structuredFormat?.mainText?.text ?? p.text?.text ?? 'Unnamed place',
        subtitle: p.structuredFormat?.secondaryText?.text ?? '',
      }));
    return { enabled: true, suggestions };
  }

  async details(placeId: string, sessionToken: string): Promise<PlaceDetails> {
    if (!this.enabled) throw new ServiceUnavailableException('Place search is not configured');
    if (!PLACE_ID_RE.test(placeId)) throw new BadRequestException('Invalid place');
    if (!SESSION_RE.test(sessionToken)) throw new BadRequestException('Invalid search session');

    const url = `${DETAILS_URL}${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en`;
    const d = await this.call<DetailsResponse>(url, {
      method: 'GET',
      headers: { 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location' },
    });
    const lat = d.location?.latitude;
    const lng = d.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new ServiceUnavailableException('That place has no location. Choose it on the map.');
    }
    const name = d.displayName?.text ?? '';
    const formatted = d.formattedAddress ?? '';
    return {
      placeId,
      name,
      address: name && !formatted.startsWith(name) ? `${name}, ${formatted}` : formatted || name,
      lat,
      lng,
    };
  }

  private async call<T>(url: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY!.trim(),
          ...(url.startsWith(AUTOCOMPLETE_URL) ? { 'X-Goog-FieldMask': '*' } : {}),
        },
      });
    } catch (err) {
      this.logger.error(
        `Places request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException(
        'Place search is unavailable. Choose the spot on the map.',
      );
    }
    if (!res.ok) {
      // Log Google's reason (quota, key restrictions) for us; never show it to users.
      const detail = await res.text().catch(() => '');
      this.logger.error(`Places API ${res.status}: ${detail.slice(0, 300)}`);
      throw new ServiceUnavailableException(
        'Place search is unavailable. Choose the spot on the map.',
      );
    }
    return (await res.json()) as T;
  }
}
