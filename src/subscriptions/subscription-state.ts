import { SubscriptionStatus } from '../domain/types/subscription';

export const DEFAULT_GRACE_PERIOD_HOURS = 24;

export interface SubscriptionTimeline {
  readonly trialEndsAt: Date | null;
  readonly paidUntil: Date | null;
  readonly graceEndsAt: Date | null;
}

export interface EffectiveSubscriptionState {
  /** Status derived from timestamps at `now`; never trusts the stored `status` column. */
  readonly effectiveStatus: SubscriptionStatus;
  readonly canAccept: boolean;
  /** End of grace when effectiveStatus is GRACE_PERIOD, otherwise null. */
  readonly graceEndsAt: Date | null;
}

/** Reads GRACE_PERIOD_HOURS (non-negative integer), falling back to 24h. */
export function readGracePeriodHours(raw = process.env.GRACE_PERIOD_HOURS): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_GRACE_PERIOD_HOURS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_GRACE_PERIOD_HOURS;
}

/**
 * Derives the subscription lifecycle state purely from its timestamps.
 *
 * Nothing in the system moves the stored `status` column from ACTIVE → GRACE_PERIOD → SUSPENDED
 * when time passes, so every reader must use this instead of the stored value:
 *
 * 1. paid_until in the future            → ACTIVE
 * 2. trial_ends_at in the future         → TRIAL
 * 3. stored grace_ends_at in the future  → GRACE_PERIOD (explicitly granted grace)
 * 4. within graceHours after paid_until  → GRACE_PERIOD (automatic grace after a PAID week;
 *                                          an expired trial gets no automatic grace)
 * 5. otherwise                           → SUSPENDED
 */
export function computeSubscriptionState(
  timeline: SubscriptionTimeline,
  now: Date,
  graceHours: number = readGracePeriodHours(),
): EffectiveSubscriptionState {
  const t = now.getTime();

  if (timeline.paidUntil && timeline.paidUntil.getTime() > t) {
    return { effectiveStatus: 'ACTIVE', canAccept: true, graceEndsAt: null };
  }
  if (timeline.trialEndsAt && timeline.trialEndsAt.getTime() > t) {
    return { effectiveStatus: 'TRIAL', canAccept: true, graceEndsAt: null };
  }

  const automaticGraceEnd = timeline.paidUntil
    ? new Date(timeline.paidUntil.getTime() + graceHours * 60 * 60 * 1000)
    : null;
  const candidates = [timeline.graceEndsAt, automaticGraceEnd].filter(
    (d): d is Date => d !== null && d.getTime() > t,
  );
  if (candidates.length > 0) {
    const graceEnd = new Date(Math.max(...candidates.map((d) => d.getTime())));
    return { effectiveStatus: 'GRACE_PERIOD', canAccept: true, graceEndsAt: graceEnd };
  }

  return { effectiveStatus: 'SUSPENDED', canAccept: false, graceEndsAt: null };
}
