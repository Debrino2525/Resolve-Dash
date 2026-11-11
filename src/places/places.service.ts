import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { haversineMeters } from '../orders/geo';

/**
 * Place search for pickup/drop-off, proxied through our server so providers can be switched (and
 * keys kept) without an app release. Results are restricted to Ghana and biased towards the
 * customer's position. The apps still make the customer confirm the exact spot on a map.
 *
 * Providers, in order:
 *  1. Google Places API (New), only when GOOGLE_PLACES_API_KEY is set (paid; off by default).
 *     Billing is per "session": the app sends one sessionToken per search.
 *  2. OpenStreetMap via a Photon server (free). Tested on common Ghanaian places (markets,
 *     malls, junctions, hospitals, trotro stops) it finds what Mapbox cannot. PHOTON_URL picks
 *     the server (default: the public komoot instance, fair use only; self-host or use a paid
 *     host when volume grows). PHOTON_URL=off disables it.
 *     When OSM finds fewer than 3 places (or is down), HERE Autosuggest tops the list up if
 *     HERE_API_KEY is set: more shops and offices. Capped per day by HERE_DAILY_LIMIT (default
 *     900, about 27,000 a month, inside HERE's free monthly allowance).
 *  Otherwise `enabled: false`, and the apps fall back to Mapbox (areas only).
 */

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_URL = 'https://places.googleapis.com/v1/places/';
const BIAS_RADIUS_M = 30_000;
const DEFAULT_PHOTON_URL = 'https://photon.komoot.io';
/** Ghana's bounding box (minLon,minLat,maxLon,maxLat). */
const GHANA_BBOX = '-3.27,4.70,1.21,11.18';
const PHOTON_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX = 1000;
const USER_AGENT = 'GhanaDash/1.0 (+https://ghanadash.globitechcybersolutions.com)';
const HERE_AUTOSUGGEST_URL = 'https://autosuggest.search.hereapi.com/v1/autosuggest';
const HERE_DEFAULT_DAILY_LIMIT = 900;
/**
 * Launch city (Sekondi-Takoradi, Market Circle): search leans here when the user's position is
 * unknown. Change when launching elsewhere.
 */
const DEFAULT_CENTRE = { lat: 4.8975, lng: -1.7553 };
/** Top up with HERE when OSM returns fewer than this many *local* places. */
const MIN_GOOD_RESULTS = 3;
const MAX_RESULTS = 6;
/** Results within this distance of the user (or the launch city) are listed first. */
const LOCAL_RADIUS_M = 40_000;

export type PlaceProvider = 'google' | 'osm';
export type PlaceSource = 'google' | 'osm' | 'here' | 'geoapify';

export interface PlaceSuggestion {
  placeId: string;
  title: string;
  subtitle: string;
  /** Present when the provider gives coordinates up front (OSM, HERE): no details call needed. */
  lat?: number;
  lng?: number;
  /** Who found it, so the app can credit the data source. */
  source?: PlaceSource;
}

export interface AutocompleteResult {
  enabled: boolean;
  provider?: PlaceProvider;
  suggestions: PlaceSuggestion[];
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_value?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
    countrycode?: string;
  };
}

/** Short, friendly labels for common OSM categories ("bus_stop" -> "Bus stop"). */
const CATEGORY_LABEL: Record<string, string> = {
  bus_stop: 'Bus stop',
  marketplace: 'Market',
  mall: 'Mall',
  supermarket: 'Supermarket',
  fuel: 'Fuel station',
  place_of_worship: 'Place of worship',
  aerodrome: 'Airport',
  primary: 'Road',
  secondary: 'Road',
  tertiary: 'Road',
  trunk: 'Road',
  residential: 'Street',
};

interface HereItem {
  id?: string;
  title?: string;
  resultType?: string;
  position?: { lat?: number; lng?: number };
  address?: { label?: string; countryCode?: string };
  categories?: { name?: string; primary?: boolean }[];
}

/** "Accra Mall, Spintex Road, La Dade-Kotopon, Ghana" -> "Spintex Road, La Dade-Kotopon". */
function hereWhere(label: string | undefined, title: string): string {
  let rest = (label ?? '').replace(/,\s*Ghana$/i, '').trim();
  if (rest.toLowerCase().startsWith(title.toLowerCase())) {
    rest = rest.slice(title.length).replace(/^[,\s]+/, '');
  }
  return rest;
}

function categoryLabel(value: string | undefined): string | null {
  if (!value || ['yes', 'fixme', 'unclassified', 'unknown'].includes(value.toLowerCase()))
    return null;
  if (CATEGORY_LABEL[value]) return CATEGORY_LABEL[value];
  const words = value.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Mall · Spintex Road, Greater Accra" style secondary line. */
export function photonSubtitle(p: NonNullable<PhotonFeature['properties']>, title: string): string {
  const seen = new Set([title.toLowerCase()]);
  const parts: string[] = [];
  const add = (v?: string): void => {
    const t = v?.trim();
    if (!t || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    parts.push(t);
  };
  add(p.street);
  add(p.district ?? p.locality);
  // Admin names like "Okaikoi South Sub Metropolitan District" are noise when we have better.
  for (const v of [p.city, p.county]) {
    if (parts.length < 2 && v && !/district$/i.test(v)) add(v);
  }
  add(p.state?.replace(/\s+Region$/i, ''));
  const where = parts.slice(0, 3).join(', ');
  const label = categoryLabel(p.osm_value);
  return [label, where].filter(Boolean).join(' · ');
}

/** Street-level description of a map point ("Near X, Street, Area"). */
export interface ReverseAddress {
  /** One line for the app: "Near Nakoff Hotel, Turkson Avenue, Pipeano". */
  address: string;
  street: string | null;
  /** Closest named landmark within ~120 m (school, hotel, shop, fuel station…). */
  near: string | null;
  area: string | null;
  source: 'osm' | 'here' | 'geoapify';
}

interface PhotonReverseFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_key?: string;
    osm_value?: string;
    name?: string;
    street?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
  };
}

/** Roads people name in directions; footpaths and service lanes are skipped. */
const NAMED_ROAD = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'road',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
]);
/** Kinds of places that make good "near …" landmarks. */
const LANDMARK_KEYS = new Set([
  'amenity',
  'shop',
  'tourism',
  'leisure',
  'office',
  'healthcare',
  'craft',
  'building',
  'historic',
]);
const STREET_RADIUS_M = 150;
const LANDMARK_RADIUS_M = 120;

function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number): number => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Builds the one-line address from the nearest street, landmark and area. Exported for tests. */
export function describePoint(
  at: { lat: number; lng: number },
  features: PhotonReverseFeature[],
): Omit<ReverseAddress, 'source'> | null {
  let street: { name: string; d: number } | null = null;
  let near: { name: string; d: number } | null = null;
  let area: string | null = null;
  for (const f of features) {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    if (!p || !c) continue;
    const d = metresBetween(at, { lat: c[1], lng: c[0] });
    area ??= p.district ?? p.locality ?? null;
    const name = p.name?.trim();
    if (p.osm_key === 'highway') {
      if (
        name &&
        NAMED_ROAD.has(p.osm_value ?? '') &&
        d <= STREET_RADIUS_M &&
        (!street || d < street.d)
      ) {
        street = { name, d };
      }
    } else if (
      name &&
      LANDMARK_KEYS.has(p.osm_key ?? '') &&
      d <= LANDMARK_RADIUS_M &&
      (!near || d < near.d)
    ) {
      near = { name, d };
      // A landmark's own street is a good street when no road was found close by.
      if (!street && p.street) street = { name: p.street, d: d + 1 };
    }
  }
  if (!street && !near && !area) return null;
  const parts = [near ? `Near ${near.name}` : null, street?.name ?? null, area].filter(
    (x, i, all): x is string => Boolean(x) && all.indexOf(x) === i,
  );
  return {
    address: parts.join(', '),
    street: street?.name ?? null,
    near: near?.name ?? null,
    area,
  };
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
  private readonly cache = new Map<string, { at: number; value: PlaceSuggestion[] }>();
  private readonly reverseCache = new Map<string, { at: number; value: ReverseAddress }>();
  private hereDay = '';
  private hereCount = 0;
  /** Replaceable in tests. */
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init);
  now: () => number = () => Date.now();

  /** True when GOOGLE_PLACES_API_KEY is set (paid; takes priority over OSM). */
  get enabled(): boolean {
    return Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
  }

  private get photonUrl(): string | null {
    const v = process.env.PHOTON_URL?.trim();
    if (v?.toLowerCase() === 'off') return null;
    return (v || DEFAULT_PHOTON_URL).replace(/\/+$/, '');
  }

  private get hereKey(): string | null {
    return process.env.HERE_API_KEY?.trim() || null;
  }

  private get hereDailyLimit(): number {
    const n = Number(process.env.HERE_DAILY_LIMIT);
    return Number.isFinite(n) && n >= 0 ? n : HERE_DEFAULT_DAILY_LIMIT;
  }

  get provider(): PlaceProvider | null {
    if (this.enabled) return 'google';
    return this.photonUrl ? 'osm' : null;
  }

  async autocomplete(
    input: string,
    sessionToken: string,
    near: { lat: number; lng: number } | null,
  ): Promise<AutocompleteResult> {
    const provider = this.provider;
    if (!provider) return { enabled: false, suggestions: [] };
    const q = input.trim().replace(/\s+/g, ' ');
    if (q.length < 2) return { enabled: true, provider, suggestions: [] };
    if (q.length > 120) throw new BadRequestException('Search text is too long');
    if (provider === 'osm') {
      return { enabled: true, provider, suggestions: await this.openSearch(q, near) };
    }
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
    return { enabled: true, provider, suggestions };
  }

  /** OSM first; HERE tops up thin results (or stands in when OSM is down) while under its cap. */
  private async openSearch(
    q: string,
    near: { lat: number; lng: number } | null,
  ): Promise<PlaceSuggestion[]> {
    const key = `${q.toLowerCase()}|${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ''}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < CACHE_TTL_MS) return hit.value;

    let osm: PlaceSuggestion[] = [];
    let osmFailed = false;
    try {
      osm = await this.photon(q, near);
    } catch (err) {
      // The free Photon server is best effort: Geoapify (same OpenStreetMap data, paid host)
      // stands in when it is down or slow.
      try {
        osm = await this.geoapifySearch(q, near);
      } catch (geoErr) {
        this.logger.warn(
          `Geoapify search fallback failed: ${geoErr instanceof Error ? geoErr.message : String(geoErr)}`,
        );
        osmFailed = true;
        if (!this.hereKey) throw err;
      }
    }

    const centre = near ?? DEFAULT_CENTRE;
    const isLocal = (p: PlaceSuggestion): boolean =>
      typeof p.lat === 'number' &&
      typeof p.lng === 'number' &&
      haversineMeters(centre, { lat: p.lat, lng: p.lng }) <= LOCAL_RADIUS_M;
    // Same-named places elsewhere in Ghana ("Tanokrom", Ashanti) go below the local ones.
    const localFirst = (list: PlaceSuggestion[]): PlaceSuggestion[] => [
      ...list.filter(isLocal),
      ...list.filter((p) => !isLocal(p)),
    ];

    let out = localFirst(osm).slice(0, MAX_RESULTS);
    let complete = !osmFailed;
    if (osm.filter(isLocal).length < MIN_GOOD_RESULTS && this.takeHereQuota()) {
      try {
        const here = await this.here(q, near);
        const taken = new Set(osm.map((s) => s.title.toLowerCase()));
        out = localFirst([...osm, ...here.filter((h) => !taken.has(h.title.toLowerCase()))]).slice(
          0,
          MAX_RESULTS,
        );
      } catch (err) {
        complete = false;
        this.logger.error(
          `HERE place search failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (osmFailed) {
          throw new ServiceUnavailableException(
            'Place search is unavailable. Choose the spot on the map.',
          );
        }
      }
    } else if (osmFailed) {
      throw new ServiceUnavailableException(
        'Place search is unavailable. Choose the spot on the map.',
      );
    }

    // Only cache full answers, so a provider hiccup isn't remembered for 12 hours.
    if (complete) {
      if (this.cache.size >= CACHE_MAX) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      this.cache.set(key, { at: this.now(), value: out });
    }
    return out;
  }

  /**
   * Street-level address for a map pin (the customer's exact pickup or drop-off). OpenStreetMap
   * first (nearest named street, landmark and area), HERE when OSM has nothing nearby.
   */
  async reverse(at: { lat: number; lng: number }): Promise<ReverseAddress | null> {
    const key = `rev|${at.lat.toFixed(4)},${at.lng.toFixed(4)}`;
    const hit = this.reverseCache.get(key);
    if (hit && this.now() - hit.at < CACHE_TTL_MS) return hit.value;

    let result: ReverseAddress | null = null;
    if (this.photonUrl) {
      try {
        let osmSource: 'osm' | 'geoapify' = 'osm';
        const features = await this.photonReverse(at).catch(async (err: unknown) => {
          const geo = await this.geoapifyReverse(at).catch(() => null);
          if (geo) {
            osmSource = 'geoapify';
            return geo;
          }
          throw err;
        });
        const d = describePoint(at, features);
        if (d && (d.street || d.near)) result = { ...d, source: osmSource };
        else if (d) {
          // OSM knows the neighbourhood but no street here: take HERE's street and landmark,
          // keep OSM's neighbourhood (HERE only gives the city).
          const here = await this.hereReverse(at).catch(() => null);
          if (here && d.area) {
            const parts = [here.near ? `Near ${here.near}` : null, here.street, d.area].filter(
              (x): x is string => Boolean(x),
            );
            result = { ...here, area: d.area, address: parts.join(', ') };
          } else {
            result = here ?? { ...d, source: osmSource };
          }
        }
      } catch (err) {
        this.logger.warn(`OSM reverse failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!result) result = await this.hereReverse(at).catch(() => null);

    if (result) {
      if (this.reverseCache.size >= CACHE_MAX) {
        const oldest = this.reverseCache.keys().next().value;
        if (oldest !== undefined) this.reverseCache.delete(oldest);
      }
      this.reverseCache.set(key, { at: this.now(), value: result });
    }
    return result;
  }

  private async photonReverse(at: { lat: number; lng: number }): Promise<PhotonReverseFeature[]> {
    const params = new URLSearchParams({
      lat: at.lat.toFixed(6),
      lon: at.lng.toFixed(6),
      lang: 'en',
      limit: '15',
      radius: '0.3',
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PHOTON_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(`${this.photonUrl}/reverse?${params.toString()}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return ((await res.json()) as { features?: PhotonReverseFeature[] }).features ?? [];
    } finally {
      clearTimeout(timer);
    }
  }

  private get geoapifyKey(): string | null {
    return process.env.GEOAPIFY_API_KEY?.trim() || null;
  }

  /** Geoapify autocomplete (OpenStreetMap data), Ghana only. Used when Photon is unavailable. */
  private async geoapifySearch(
    q: string,
    near: { lat: number; lng: number } | null,
  ): Promise<PlaceSuggestion[]> {
    if (!this.geoapifyKey) throw new Error('Geoapify not configured');
    const centre = near ?? DEFAULT_CENTRE;
    const params = new URLSearchParams({
      text: q,
      filter: 'countrycode:gh',
      bias: `proximity:${centre.lng.toFixed(4)},${centre.lat.toFixed(4)}`,
      lang: 'en',
      limit: '10',
      format: 'json',
    });
    params.set('apiKey', this.geoapifyKey);
    const data = await this.getJson<{
      results?: {
        place_id?: string;
        name?: string;
        address_line1?: string;
        address_line2?: string;
        category?: string;
        lat?: number;
        lon?: number;
      }[];
    }>(`https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`);
    const out: PlaceSuggestion[] = [];
    const seen = new Set<string>();
    for (const r of data.results ?? []) {
      const title = (r.name ?? r.address_line1 ?? '').trim();
      if (!title || typeof r.lat !== 'number' || typeof r.lon !== 'number') continue;
      if (seen.has(title.toLowerCase())) continue; // same place listed twice in the map data
      seen.add(title.toLowerCase());
      const label = categoryLabel(r.category?.split('.').pop());
      out.push({
        placeId: `geoapify:${r.place_id ?? `${r.lat},${r.lon}`}`,
        title,
        subtitle: [label, (r.address_line2 ?? '').replace(/,\s*Ghana$/i, '')]
          .filter(Boolean)
          .join(' · '),
        lat: r.lat,
        lng: r.lon,
        source: 'geoapify',
      });
      if (out.length >= 12) break;
    }
    return out;
  }

  /** Geoapify reverse geocoding, shaped like Photon's so describePoint() applies the same rules. */
  private async geoapifyReverse(at: { lat: number; lng: number }): Promise<PhotonReverseFeature[]> {
    if (!this.geoapifyKey) throw new Error('Geoapify not configured');
    const params = new URLSearchParams({
      lat: at.lat.toFixed(6),
      lon: at.lng.toFixed(6),
      lang: 'en',
      limit: '5',
      format: 'json',
    });
    params.set('apiKey', this.geoapifyKey);
    const data = await this.getJson<{
      results?: {
        name?: string;
        street?: string;
        suburb?: string;
        district?: string;
        result_type?: string;
        lat?: number;
        lon?: number;
      }[];
    }>(`https://api.geoapify.com/v1/geocode/reverse?${params.toString()}`);
    return (data.results ?? [])
      .filter((r) => typeof r.lat === 'number' && typeof r.lon === 'number')
      .map((r) => {
        const isStreet = r.result_type === 'street';
        return {
          geometry: { coordinates: [r.lon as number, r.lat as number] },
          properties: {
            osm_key: isStreet ? 'highway' : 'amenity',
            osm_value: isStreet ? 'residential' : 'yes',
            name: isStreet ? (r.street ?? r.name) : r.name,
            street: r.street,
            district: r.suburb ?? r.district,
          },
        };
      });
  }

  /** GET with a timeout; the key travels in the URL, which is never logged. */
  private async getJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PHOTON_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** HERE reverse geocoding (street level), within the shared daily HERE cap. */
  private async hereReverse(at: { lat: number; lng: number }): Promise<ReverseAddress | null> {
    if (!this.takeHereQuota()) return null;
    const params = new URLSearchParams({
      at: `${at.lat.toFixed(6)},${at.lng.toFixed(6)}`,
      lang: 'en',
      limit: '1',
    });
    params.set('apiKey', this.hereKey ?? '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PHOTON_TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(
        `https://revgeocode.search.hereapi.com/v1/revgeocode?${params.toString()}`,
        {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const item = (
        (await res.json()) as {
          items?: {
            title?: string;
            resultType?: string;
            address?: { street?: string; district?: string; city?: string };
          }[];
        }
      ).items?.[0];
      if (!item?.address) return null;
      const street = item.address.street ?? null;
      const area = item.address.district ?? item.address.city ?? null;
      const near =
        item.resultType === 'place' && item.title ? item.title.split(',')[0].trim() : null;
      const parts = [near ? `Near ${near}` : null, street, area].filter((x): x is string =>
        Boolean(x),
      );
      return parts.length
        ? { address: parts.join(', '), street, near, area, source: 'here' }
        : null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Counts a HERE call against today's cap (UTC day); false when HERE is off or capped. */
  private takeHereQuota(): boolean {
    if (!this.hereKey) return false;
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (day !== this.hereDay) {
      this.hereDay = day;
      this.hereCount = 0;
    }
    if (this.hereCount >= this.hereDailyLimit) return false;
    this.hereCount += 1;
    return true;
  }

  private async here(
    q: string,
    near: { lat: number; lng: number } | null,
  ): Promise<PlaceSuggestion[]> {
    const at = near ?? DEFAULT_CENTRE;
    const params = new URLSearchParams({
      q,
      at: `${at.lat.toFixed(4)},${at.lng.toFixed(4)}`,
      in: 'countryCode:GHA',
      limit: '8',
      lang: 'en',
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PHOTON_TIMEOUT_MS);
    let items: HereItem[];
    try {
      // HERE takes the key as a query parameter; it is never logged (errors log status only).
      params.set('apiKey', this.hereKey ?? '');
      const res = await this.fetchImpl(`${HERE_AUTOSUGGEST_URL}?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      items = ((await res.json()) as { items?: HereItem[] }).items ?? [];
    } finally {
      clearTimeout(timer);
    }
    const out: PlaceSuggestion[] = [];
    for (const it of items) {
      const lat = it.position?.lat;
      const lng = it.position?.lng;
      const rawTitle = it.title?.trim();
      const title =
        rawTitle && it.resultType !== 'place' ? rawTitle.split(',')[0].trim() : rawTitle;
      // Query suggestions ("McDonald's near Accra") have no position: skip them.
      if (typeof lat !== 'number' || typeof lng !== 'number' || !title) continue;
      if (it.address?.countryCode && it.address.countryCode !== 'GHA') continue;
      const cat =
        it.categories?.find((c) => c.primary)?.name ??
        it.categories?.[0]?.name ??
        (it.resultType === 'street' ? 'Street' : null);
      const where = hereWhere(it.address?.label, title);
      out.push({
        placeId: `here:${it.id ?? `${lat},${lng}`}`,
        title,
        subtitle: [cat, where].filter(Boolean).join(' · '),
        lat,
        lng,
        source: 'here',
      });
    }
    return out;
  }

  /** OpenStreetMap search via Photon, Ghana only. */
  private async photon(
    q: string,
    near: { lat: number; lng: number } | null,
  ): Promise<PlaceSuggestion[]> {
    const params = new URLSearchParams({ q, limit: '15', lang: 'en', bbox: GHANA_BBOX });
    const centre = near ?? DEFAULT_CENTRE;
    params.set('lat', centre.lat.toFixed(4));
    params.set('lon', centre.lng.toFixed(4));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PHOTON_TIMEOUT_MS);
    let features: PhotonFeature[];
    try {
      const res = await this.fetchImpl(`${this.photonUrl}/api/?${params.toString()}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      features = ((await res.json()) as { features?: PhotonFeature[] }).features ?? [];
    } catch (err) {
      this.logger.error(
        `OSM place search failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException(
        'Place search is unavailable. Choose the spot on the map.',
      );
    } finally {
      clearTimeout(timer);
    }

    const out: PlaceSuggestion[] = [];
    const seen = new Set<string>();
    for (const f of features) {
      const p = f.properties;
      const c = f.geometry?.coordinates;
      if (!p || !c || p.countrycode !== 'GH') continue;
      const [lng, lat] = c;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const title =
        p.name?.trim() ||
        [p.housenumber, p.street].filter(Boolean).join(' ').trim() ||
        p.district ||
        p.city;
      if (!title) continue;
      // Same name a few metres apart (duplicate map entries): keep the first.
      const dedupe = `${title.toLowerCase()}|${lat.toFixed(3)},${lng.toFixed(3)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({
        placeId: `osm:${p.osm_type ?? ''}${p.osm_id ?? `${lat},${lng}`}`,
        title,
        subtitle: photonSubtitle(p, title),
        lat,
        lng,
        source: 'osm',
      });
      if (out.length >= 12) break;
    }
    return out;
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
