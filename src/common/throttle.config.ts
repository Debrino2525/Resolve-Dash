function readPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Window for all rate limits (THROTTLE_TTL_MS, default 60s). */
export const throttleTtlMs = (): number => readPositiveInt(process.env.THROTTLE_TTL_MS, 60_000);

/**
 * Default per-IP request budget per window (THROTTLE_LIMIT, default 120).
 * Generous on purpose: the admin page polls every 8s and riders refresh often.
 */
export const throttleLimit = (): number => readPositiveInt(process.env.THROTTLE_LIMIT, 120);

/** Strict per-IP budget for credential endpoints such as admin login (AUTH_THROTTLE_LIMIT, default 5). */
export const authThrottleLimit = (): number => readPositiveInt(process.env.AUTH_THROTTLE_LIMIT, 5);
