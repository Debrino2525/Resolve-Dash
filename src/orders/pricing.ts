export interface PricingSettings {
  /** Flat fare including pickup, in pesewas (FARE_BASE_PESEWAS, default GH₵18.00). */
  baseFarePesewas: number;
  /** Per road kilometre, in pesewas (FARE_PER_KM_PESEWAS, default GH₵1.25). */
  perKmPesewas: number;
  /** Each drop-off after the first, in pesewas (FARE_PER_STOP_PESEWAS, default GH₵5.00). */
  perStopPesewas: number;
}

export interface FareBreakdown {
  baseFarePesewas: number;
  distanceFarePesewas: number;
  /** Extra drop-offs × the per-stop charge (0 for a single drop-off). */
  stopsFarePesewas: number;
  farePesewas: number;
}

/** Up to 4 drop-offs per delivery: the final one plus 3 before it. */
export const MAX_EXTRA_STOPS = 3;

function readInt(raw: string | undefined, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** Read on every quote so a backend config change takes effect without an app update. */
export function readPricing(env: NodeJS.ProcessEnv = process.env): PricingSettings {
  return {
    baseFarePesewas: readInt(env.FARE_BASE_PESEWAS, 1800),
    perKmPesewas: readInt(env.FARE_PER_KM_PESEWAS, 125),
    perStopPesewas: readInt(env.FARE_PER_STOP_PESEWAS, 500),
  };
}

/**
 * GH₵18.00 once + GH₵1.25 × road km of the whole route + GH₵5.00 per extra drop-off.
 * e.g. 5.2 km, one drop-off → 1800 + 650 = GH₵24.50;
 *      9 km, three drop-offs → 1800 + 1125 + 2 × 500 = GH₵39.25. Whole pesewas.
 */
export function priceTrip(
  distanceMeters: number,
  pricing: PricingSettings,
  extraStops = 0,
): FareBreakdown {
  const distanceFare = Math.round((Math.max(0, distanceMeters) / 1000) * pricing.perKmPesewas);
  const stopsFare = Math.max(0, Math.floor(extraStops)) * pricing.perStopPesewas;
  return {
    baseFarePesewas: pricing.baseFarePesewas,
    distanceFarePesewas: distanceFare,
    stopsFarePesewas: stopsFare,
    farePesewas: pricing.baseFarePesewas + distanceFare + stopsFare,
  };
}
