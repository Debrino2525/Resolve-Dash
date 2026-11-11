export interface PricingSettings {
  /** Flat fare including pickup, in pesewas (FARE_BASE_PESEWAS, default GH₵18.00). */
  baseFarePesewas: number;
  /** Per road kilometre, in pesewas (FARE_PER_KM_PESEWAS, default GH₵1.25). */
  perKmPesewas: number;
}

export interface FareBreakdown {
  baseFarePesewas: number;
  distanceFarePesewas: number;
  farePesewas: number;
}

function readInt(raw: string | undefined, fallback: number): number {
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** Read on every quote so a backend config change takes effect without an app update. */
export function readPricing(env: NodeJS.ProcessEnv = process.env): PricingSettings {
  return {
    baseFarePesewas: readInt(env.FARE_BASE_PESEWAS, 1800),
    perKmPesewas: readInt(env.FARE_PER_KM_PESEWAS, 125),
  };
}

/** GH₵18.00 + GH₵1.25 × road km (e.g. 5.2 km → 1800 + 650 = GH₵24.50). Whole pesewas. */
export function priceTrip(distanceMeters: number, pricing: PricingSettings): FareBreakdown {
  const distanceFare = Math.round((Math.max(0, distanceMeters) / 1000) * pricing.perKmPesewas);
  return {
    baseFarePesewas: pricing.baseFarePesewas,
    distanceFarePesewas: distanceFare,
    farePesewas: pricing.baseFarePesewas + distanceFare,
  };
}
