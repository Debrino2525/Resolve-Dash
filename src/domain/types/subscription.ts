import { Pesewas } from './money';

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'GRACE_PERIOD' | 'SUSPENDED';

export interface SubscriptionSettings {
  readonly pricePesewas: Pesewas;
  readonly currency: 'GHS';
  readonly periodDays: number;
  readonly trialDays: number;
  readonly graceHours: number;
  readonly reminderWindowsHours: readonly number[];
}

export interface Subscription {
  id: string; // UUID v4
  riderId: string;
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  paidUntil: Date | null;
  graceEndsAt: Date | null;
  trialUsed: boolean;
  /**
   * Keyed by billing period (e.g. '2026-W45') to prevent duplicate reminder notifications
   */
  remindersSent: Record<string, string[]>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DispatchEligibilityResult {
  canAccept: boolean;
  reason?: string;
  isMidTrip: boolean;
  effectiveStatus: SubscriptionStatus;
}
