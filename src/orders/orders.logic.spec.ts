import { pickNearest } from './dispatch.service';
import { haversineMeters, isInGhana } from './geo';
import { createOrderSchema, normaliseGhanaPhone, presenceSchema } from './order.schemas';
import { generateCode } from './order.service';
import { priceTrip, readPricing } from './pricing';

describe('pricing', () => {
  const rates = readPricing({});

  it('defaults to the design rates: GH₵18.00 base + GH₵1.25/km', () => {
    expect(rates).toEqual({ baseFarePesewas: 1800, perKmPesewas: 125, perStopPesewas: 500 });
  });

  it('prices the design example (5.2 km) at GH₵24.50', () => {
    expect(priceTrip(5200, rates)).toEqual({
      baseFarePesewas: 1800,
      distanceFarePesewas: 650,
      stopsFarePesewas: 0,
      farePesewas: 2450,
    });
  });

  it('charges the base once, the whole route by km, and GH₵5 per extra drop-off', () => {
    // 9 km route, 3 drop-offs: 18.00 + 11.25 + 2 × 5.00 = GH₵39.25
    expect(priceTrip(9000, rates, 2)).toEqual({
      baseFarePesewas: 1800,
      distanceFarePesewas: 1125,
      stopsFarePesewas: 1000,
      farePesewas: 3925,
    });
  });

  it('rounds to whole pesewas and never goes below the base fare', () => {
    expect(priceTrip(1234, rates).distanceFarePesewas).toBe(154); // 1.234 × 125 = 154.25
    expect(priceTrip(-50, rates).farePesewas).toBe(1800);
  });

  it('reads overrides from the environment', () => {
    expect(
      readPricing({
        FARE_BASE_PESEWAS: '2000',
        FARE_PER_KM_PESEWAS: '150',
        FARE_PER_STOP_PESEWAS: '300',
      }),
    ).toEqual({ baseFarePesewas: 2000, perKmPesewas: 150, perStopPesewas: 300 });
    expect(readPricing({ FARE_BASE_PESEWAS: 'abc' }).baseFarePesewas).toBe(1800);
  });
});

describe('pickNearest', () => {
  const osu = { lat: 5.556, lng: -0.182 };
  const near = { riderId: 'near', lat: 5.56, lng: -0.18, eligible: true };
  const nearer = { riderId: 'nearer', lat: 5.557, lng: -0.182, eligible: true };
  const ineligible = { riderId: 'lapsed', lat: 5.5561, lng: -0.182, eligible: false };
  const kumasi = { riderId: 'far', lat: 6.6885, lng: -1.6244, eligible: true };

  it('chooses the closest eligible rider', () => {
    expect(pickNearest(osu, [near, nearer, ineligible])?.riderId).toBe('nearer');
  });

  it('skips riders whose plan or approval lapsed', () => {
    expect(pickNearest(osu, [ineligible])).toBeNull();
  });

  it('ignores riders outside the dispatch radius', () => {
    expect(pickNearest(osu, [kumasi])).toBeNull();
  });
});

describe('geo', () => {
  it('measures Accra → Kumasi as ~200 km', () => {
    const d = haversineMeters({ lat: 5.6037, lng: -0.187 }, { lat: 6.6885, lng: -1.6244 });
    expect(d / 1000).toBeGreaterThan(195);
    expect(d / 1000).toBeLessThan(205);
  });

  it.each([
    [{ lat: 5.6, lng: -0.19 }, true], // Accra
    [{ lat: 4.9, lng: -1.76 }, true], // Takoradi
    [{ lat: 9.4, lng: -0.85 }, true], // Tamale
    [{ lat: 6.45, lng: 3.4 }, false], // Lagos
    [{ lat: 51.5, lng: -0.12 }, false], // London
  ])('isInGhana(%p) is %p', (p, expected) => {
    expect(isInGhana(p)).toBe(expected);
  });
});

describe('order schemas', () => {
  it.each([
    ['0241234567', '+233241234567'],
    ['024 123 4567', '+233241234567'],
    ['+233501112233', '+233501112233'],
    ['233201234567', '+233201234567'],
    ['0341234567', null],
    ['12345', null],
  ])('normalises %p to %p', (input, expected) => {
    expect(normaliseGhanaPhone(input)).toBe(expected);
  });

  const stop = {
    lat: 5.556,
    lng: -0.182,
    address: 'Oxford St, Osu',
    landmark: 'Opposite Shell',
    gpsCode: 'ga-032-1104',
    contactName: 'Kofi Mensah',
    contactPhone: '024 551 8920',
  };

  it('accepts a valid order and normalises phone and GPS code', () => {
    const r = createOrderSchema.parse({
      pickup: stop,
      dropoff: { ...stop, lat: 5.63, address: 'East Legon' },
      packageType: 'SMALL_PARCEL',
      quoteToken: 'x'.repeat(20),
    });
    expect(r.pickup.contactPhone).toBe('+233245518920');
    expect(r.pickup.gpsCode).toBe('GA-032-1104');
    expect(r.fragile).toBe(false);
    expect(r.notes).toBeNull();
  });

  it.each([
    ['a bad phone', { contactPhone: '0341234567' }],
    ['a bad GhanaPost code', { gpsCode: 'ACCRA' }],
    ['a missing address', { address: '' }],
  ])('rejects %s', (_l, patch) => {
    expect(
      createOrderSchema.safeParse({
        pickup: { ...stop, ...patch },
        dropoff: stop,
        packageType: 'FOOD',
        quoteToken: 'x'.repeat(20),
      }).success,
    ).toBe(false);
  });

  it('rejects unknown package types', () => {
    expect(
      createOrderSchema.safeParse({
        pickup: stop,
        dropoff: stop,
        packageType: 'LIVESTOCK',
        quoteToken: 'x'.repeat(20),
      }).success,
    ).toBe(false);
  });

  it('validates presence heartbeats', () => {
    expect(presenceSchema.safeParse({ online: true, lat: 5.5, lng: -0.2 }).success).toBe(true);
    expect(presenceSchema.safeParse({ online: true, lat: 95, lng: 0 }).success).toBe(false);
  });
});

describe('generateCode', () => {
  it('makes short, unambiguous order codes', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateCode()));
    for (const c of codes) expect(c).toMatch(/^GD-[A-HJ-NP-Z2-9]{6}$/);
    expect(codes.size).toBeGreaterThan(195);
  });
});
