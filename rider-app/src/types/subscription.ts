import { Pesewas } from './money';

export type RiderOnboardingStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'REJECTED';

export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'SUSPENDED';

export interface RiderProfile {
  id: string;
  phoneNumber: string;
  fullName: string;
  onboardingStatus: RiderOnboardingStatus;
}

export interface SubscriptionDetails {
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  paidUntil: string | null;
  graceEndsAt: string | null;
  canAcceptOrders: boolean;
  pricePesewas: Pesewas;
  /**
   * Authoritative server timestamp (ISO 8601).
   * All client-side countdowns must be computed against this, never device local clock.
   */
  serverTime: string;
}

export interface CheckoutSessionResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
  checkoutExpiresAt: string;
}
