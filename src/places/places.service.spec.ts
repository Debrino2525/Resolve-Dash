import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PlacesService } from './places.service';

const SESSION = '0b6a9c1e-7d2f-4c7e-9a3f-1234567890ab';

describe('PlacesService', () => {
  const original = process.env.GOOGLE_PLACES_API_KEY;
  const originalPhoton = process.env.PHOTON_URL;
  let svc: PlacesService;
  let fetchFn: jest.Mock;

  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    svc = new PlacesService();
    fetchFn = jest.fn();
    svc.fetchImpl = fetchFn as unknown as typeof fetch;
  });
  afterEach(() => {
    if (originalPhoton === undefined) delete process.env.PHOTON_URL;
    else process.env.PHOTON_URL = originalPhoton;
  });
  afterAll(() => {
    process.env.GOOGLE_PLACES_API_KEY = original;
  });

  it('reports disabled (no calls) when Google has no key and OSM is turned off', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    process.env.PHOTON_URL = 'off';
    await expect(svc.autocomplete('Accra Mall', SESSION, null)).resolves.toEqual({
      enabled: false,
      suggestions: [],
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('searches Ghana only, biased to the user, with the key in a header', async () => {
    fetchFn.mockResolvedValue({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            placePrediction: {
              placeId: 'ChIJ-accra-mall',
              structuredFormat: {
                mainText: { text: 'Accra Mall' },
                secondaryText: { text: 'Spintex Road, Accra' },
              },
            },
          },
          { queryPrediction: { text: { text: 'accra mall shops' } } },
        ],
      }),
    });
    const res = await svc.autocomplete('Accra Mall', SESSION, { lat: 5.6, lng: -0.18 });
    expect(res.suggestions).toEqual([
      { placeId: 'ChIJ-accra-mall', title: 'Accra Mall', subtitle: 'Spintex Road, Accra' },
    ]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('places:autocomplete');
    expect(url).not.toContain('test-key'); // never in the URL (logs)
    expect(init.headers['X-Goog-Api-Key']).toBe('test-key');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ includedRegionCodes: ['gh'], sessionToken: SESSION });
    expect(body.locationBias.circle.center).toEqual({ latitude: 5.6, longitude: -0.18 });
  });

  it('returns the exact coordinates and a readable address for a chosen place', async () => {
    fetchFn.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'ChIJ-accra-mall',
        displayName: { text: 'Accra Mall' },
        formattedAddress: 'Spintex Rd, Accra, Ghana',
        location: { latitude: 5.6223, longitude: -0.1736 },
      }),
    });
    await expect(svc.details('ChIJ-accra-mall', SESSION)).resolves.toEqual({
      placeId: 'ChIJ-accra-mall',
      name: 'Accra Mall',
      address: 'Accra Mall, Spintex Rd, Accra, Ghana',
      lat: 5.6223,
      lng: -0.1736,
    });
    expect(fetchFn.mock.calls[0][1].headers['X-Goog-FieldMask']).toBe(
      'id,displayName,formattedAddress,location',
    );
  });

  it('rejects malformed ids and sessions before calling Google', async () => {
    await expect(svc.details('../../x', SESSION)).rejects.toThrow(BadRequestException);
    await expect(svc.autocomplete('Osu', 'bad token!', null)).rejects.toThrow(BadRequestException);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('hides Google errors behind a friendly message', async () => {
    fetchFn.mockResolvedValue({ ok: false, status: 403, text: async () => 'API key not valid' });
    await expect(svc.autocomplete('Osu', SESSION, null)).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(svc.autocomplete('Osu', SESSION, null)).rejects.toThrow(
      /Choose the spot on the map/,
    );
  });
});

describe('PlacesService with OpenStreetMap (no Google key)', () => {
  const original = process.env.GOOGLE_PLACES_API_KEY;
  const originalPhoton = process.env.PHOTON_URL;
  let svc: PlacesService;
  let fetchFn: jest.Mock;

  const feature = (
    name: string,
    lng: number,
    lat: number,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    geometry: { coordinates: [lng, lat] },
    properties: {
      osm_type: 'W',
      osm_id: 42,
      osm_value: 'mall',
      name,
      street: 'Spintex Road',
      county: 'La-Dade-Kotopon Municipal District',
      state: 'Greater Accra Region',
      countrycode: 'GH',
      ...extra,
    },
  });

  beforeEach(() => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.PHOTON_URL;
    svc = new PlacesService();
    fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          feature('Accra Mall', -0.1729, 5.6222),
          feature('Accra Mall', -0.17291, 5.62221, { osm_id: 43 }), // duplicate entry
          feature('Accra Mall', -0.1743, 5.6236, { osm_value: 'bus_stop', osm_id: 44 }),
          feature('Lome Mall', 1.22, 6.13, { countrycode: 'TG' }), // not Ghana
        ],
      }),
    });
    svc.fetchImpl = fetchFn as unknown as typeof fetch;
  });
  afterAll(() => {
    process.env.GOOGLE_PLACES_API_KEY = original;
    if (originalPhoton === undefined) delete process.env.PHOTON_URL;
    else process.env.PHOTON_URL = originalPhoton;
  });

  it('returns Ghana places with coordinates and a readable line', async () => {
    const res = await svc.autocomplete('accra  mall', '', { lat: 5.6, lng: -0.18 });
    expect(res.enabled).toBe(true);
    expect(res.provider).toBe('osm');
    expect(res.suggestions).toEqual([
      {
        placeId: 'osm:W42',
        title: 'Accra Mall',
        subtitle: 'Mall · Spintex Road, Greater Accra',
        lat: 5.6222,
        lng: -0.1729,
      },
      {
        placeId: 'osm:W44',
        title: 'Accra Mall',
        subtitle: 'Bus stop · Spintex Road, Greater Accra',
        lat: 5.6236,
        lng: -0.1743,
      },
    ]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toMatch(/^https:\/\/photon\.komoot\.io\/api\/\?/);
    expect(url).toContain('q=accra+mall');
    expect(url).toContain('bbox=');
    expect(url).toContain('lat=5.6000');
    expect(init.headers['User-Agent']).toMatch(/GhanaDash/);
  });

  it('caches repeat searches', async () => {
    await svc.autocomplete('Accra Mall', '', null);
    await svc.autocomplete('accra mall', '', null);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('uses PHOTON_URL when set (self-hosted server)', async () => {
    process.env.PHOTON_URL = 'https://photon.example.com/';
    await svc.autocomplete('Makola', '', null);
    expect(fetchFn.mock.calls[0][0]).toMatch(/^https:\/\/photon\.example\.com\/api\/\?/);
  });

  it('gives a friendly error when the search server fails', async () => {
    fetchFn.mockResolvedValue({ ok: false, status: 429 });
    await expect(svc.autocomplete('Makola', '', null)).rejects.toThrow(/Choose the spot on the map/);
  });

  it('prefers Google when its key is set', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'k';
    fetchFn.mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) });
    const res = await svc.autocomplete('Makola', '0b6a9c1e-7d2f-4c7e', null);
    expect(res.provider).toBe('google');
    expect(fetchFn.mock.calls[0][0]).toContain('places:autocomplete');
  });
});
