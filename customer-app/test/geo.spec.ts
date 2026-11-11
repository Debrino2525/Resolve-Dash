import {
  distanceMeters,
  formatDistance,
  navigationUrl,
  offsetPoint,
  regionForPoints,
} from '../src/utils/geo';

const ACCRA = { latitude: 5.6037, longitude: -0.187 };
const KUMASI = { latitude: 6.6885, longitude: -1.6244 };

describe('distanceMeters', () => {
  it('measures Accra → Kumasi as roughly 200 km', () => {
    const km = distanceMeters(ACCRA, KUMASI) / 1000;
    expect(km).toBeGreaterThan(195);
    expect(km).toBeLessThan(205);
  });

  it('is zero for the same point', () => {
    expect(distanceMeters(ACCRA, ACCRA)).toBe(0);
  });
});

describe('offsetPoint', () => {
  it.each([0, 90, 180, 270, 45])('moves the requested distance on bearing %p', (bearing) => {
    const p = offsetPoint(ACCRA, 1500, bearing);
    expect(distanceMeters(ACCRA, p)).toBeCloseTo(1500, -1);
  });

  it('moves north when the bearing is 0', () => {
    expect(offsetPoint(ACCRA, 1000, 0).latitude).toBeGreaterThan(ACCRA.latitude);
  });
});

describe('formatDistance', () => {
  it.each([
    [4, '10 m'],
    [847, '850 m'],
    [1240, '1.2 km'],
    [15300, '15 km'],
  ])('%p m → %p', (m, text) => {
    expect(formatDistance(m)).toBe(text);
  });
});

describe('navigationUrl', () => {
  it('builds a Google Maps directions link', () => {
    const url = navigationUrl(KUMASI, ACCRA);
    expect(url).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?/);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('api')).toBe('1');
    expect(params.get('destination')).toBe('6.6885,-1.6244');
    expect(params.get('origin')).toBe('5.6037,-0.187');
  });

  it('omits the origin when the rider position is unknown', () => {
    expect(new URLSearchParams(navigationUrl(KUMASI).split('?')[1]).has('origin')).toBe(false);
  });
});

describe('regionForPoints', () => {
  it('centres on and contains all points', () => {
    const r = regionForPoints([ACCRA, KUMASI]);
    expect(r.latitude).toBeCloseTo((ACCRA.latitude + KUMASI.latitude) / 2);
    expect(r.latitudeDelta).toBeGreaterThan(KUMASI.latitude - ACCRA.latitude);
  });

  it('never zooms in further than ~1 km for a single point', () => {
    expect(regionForPoints([ACCRA]).latitudeDelta).toBe(0.01);
  });
});
