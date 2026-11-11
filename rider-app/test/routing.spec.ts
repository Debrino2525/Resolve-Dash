import { decodePolyline } from '../src/utils/polyline';

// The routing module reads the token at import time.
process.env.EXPO_PUBLIC_MAPBOX_TOKEN = 'pk.test-token';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const routing = require('../src/services/routing') as typeof import('../src/services/routing');

describe('decodePolyline', () => {
  it('decodes the reference Google polyline (precision 5)', () => {
    // Example from Google's encoded polyline algorithm documentation.
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
      { latitude: 43.252, longitude: -126.453 },
    ]);
  });

  it('returns no points for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('fetchRoadRoute', () => {
  const A = { latitude: 4.8986, longitude: -1.7554 };
  const B = { latitude: 4.932, longitude: -1.735 };

  it('requests Mapbox driving directions and decodes the polyline6 geometry', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            // precision-6 encoding of (38.5,-120.2),(40.7,-120.95)
            geometry: '_izlhA~rlgdF_{geC~ywl@',
            distance: 5224,
            duration: 564,
            legs: [{ distance: 5224, duration: 564 }],
          },
        ],
      }),
    });

    const route = await routing.fetchRoadRoute([A, B], fetchFn as unknown as typeof fetch);

    const url: string = fetchFn.mock.calls[0][0];
    expect(url).toContain('/directions/v5/mapbox/driving/-1.755400,4.898600;-1.735000,4.932000');
    expect(url).toContain('geometries=polyline6');
    expect(url).toContain('access_token=pk.test-token');
    expect(route?.coordinates).toEqual([
      { latitude: 38.5, longitude: -120.2 },
      { latitude: 40.7, longitude: -120.95 },
    ]);
    expect(route?.legs[0]).toEqual({ distanceMeters: 5224, durationSeconds: 564 });
  });

  it.each([
    ['an HTTP error', { ok: false, json: async () => ({}) }],
    ['no route', { ok: true, json: async () => ({ code: 'NoRoute', routes: [] }) }],
  ])('returns null on %s so the map falls back to a straight line', async (_l, response) => {
    const fetchFn = jest.fn().mockResolvedValue(response);
    expect(await routing.fetchRoadRoute([A, B], fetchFn as unknown as typeof fetch)).toBeNull();
  });

  it('returns null when offline', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('Network request failed'));
    expect(await routing.fetchRoadRoute([A, B], fetchFn as unknown as typeof fetch)).toBeNull();
  });

  it('needs at least two points', async () => {
    const fetchFn = jest.fn();
    expect(await routing.fetchRoadRoute([A], fetchFn as unknown as typeof fetch)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('formatDuration', () => {
  it.each([
    [20, '1 min'],
    [564, '9 min'],
    [4320, '1 h 12 min'],
  ])('%p s → %p', (s, text) => {
    expect(routing.formatDuration(s)).toBe(text);
  });
});
