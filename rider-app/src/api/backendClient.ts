import { getValidAccessToken } from '../auth/supabase';
import {
  RiderProfile,
  SubscriptionDetails,
  CheckoutSessionResponse,
} from '../types/subscription';
import { toPesewas } from '../types/money';

// Default to local backend during development; configurable without public env leak
const DEFAULT_API_BASE_URL = 'http://localhost:3000';

async function authenticatedFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getValidAccessToken();

  const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  const body = (await response.json()) as {
    success?: boolean;
    data?: T;
    error?: { code?: string; message?: string };
    message?: string;
  };

  if (!response.ok) {
    const errorMsg =
      body.error?.message ??
      body.message ??
      `HTTP request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return (body.data ?? body) as T;
}

/**
 * Submits initial onboarding profile after phone OTP verification.
 * Creates rider row with status 'PENDING_VERIFICATION'.
 */
export async function onboardRider(fullName: string): Promise<RiderProfile> {
  return authenticatedFetch<RiderProfile>('/riders/onboard', {
    method: 'POST',
    body: JSON.stringify({ fullName }),
  });
}

/**
 * Fetches the rider's profile and authoritative onboarding status from the backend.
 * Screen state must be determined from this response, never client-decoded JWT claims.
 */
export async function getRiderProfile(): Promise<RiderProfile> {
  return authenticatedFetch<RiderProfile>('/riders/me', {
    method: 'GET',
  });
}

/**
 * Fetches current rider subscription lifecycle and dispatch eligibility.
 * Returns authoritative serverTime for time-skew-resistant countdown calculation.
 */
export async function getSubscriptionStatus(): Promise<SubscriptionDetails> {
  const result = await authenticatedFetch<{
    status: SubscriptionDetails['status'];
    trialEndsAt: string | null;
    paidUntil: string | null;
    graceEndsAt: string | null;
    canAcceptOrders: boolean;
    pricePesewas: number;
    serverTime: string;
  }>('/subscriptions/me', {
    method: 'GET',
  });

  return {
    ...result,
    pricePesewas: toPesewas(result.pricePesewas),
  };
}

/**
 * Initializes a prepaid weekly Paystack hosted checkout session.
 * Deep link callback is registered as 'ghanadash-rider://subscription-callback'.
 */
export async function initializeSubscriptionCheckout(): Promise<CheckoutSessionResponse> {
  return authenticatedFetch<CheckoutSessionResponse>('/subscriptions/initialize', {
    method: 'POST',
    body: JSON.stringify({
      callbackUrl: 'ghanadash-rider://subscription-callback',
    }),
  });
}
