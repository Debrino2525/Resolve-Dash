import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PlacesService } from './places.service';

const SESSION = '0b6a9c1e-7d2f-4c7e-9a3f-1234567890ab';

describe('PlacesService', () => {
  const original = process.env.GOOGLE_PLACES_API_KEY;
  let svc: PlacesService;
  let fetchFn: jest.Mock;

  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key';
    svc = new PlacesService();
    fetchFn = jest.fn();
    svc.fetchImpl = fetchFn as unknown as typeof fetch;
  });
  afterAll(() => {
    process.env.GOOGLE_PLACES_API_KEY = original;
  });

  it('reports disabled (no Google call) when no key is configured', async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
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
