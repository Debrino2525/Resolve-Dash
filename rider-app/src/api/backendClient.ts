import { getValidAccessToken } from '../auth/supabase';
import { toPesewas } from '../types/money';
import { CheckoutSessionResponse, RiderProfile, SubscriptionDetails } from '../types/subscription';

/**
 * Backend API base URL.
 *
 * EXPO GO ON A PHYSICAL DEVICE:
 * 'localhost' resolves to the device itself, not your dev machine.
 * Set EXPO_PUBLIC_API_URL to your machine's local IP, e.g.:
 *   EXPO_PUBLIC_API_URL=http://192.168.1.42:3000
 * Find it with `ipconfig` (Windows) or `ifconfig` (Mac/Linux).
 *
 * PRODUCTION:
 *   EXPO_PUBLIC_API_URL=https://api.ghanadash.com
 */
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

async function authenticatedFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getValidAccessToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
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
      body.error?.message ?? body.message ?? `HTTP request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return (body.data ?? body) as T;
}

/**
 * Submits initial onboarding profile after authentication.
 * Creates rider row with status 'PENDING_VERIFICATION'.
 */
export async function onboardRider(
  fullName: string,
  phoneNumber?: string,
): Promise<RiderProfile> {
  return authenticatedFetch<RiderProfile>('/riders/onboard', {
    method: 'POST',
    body: JSON.stringify({ fullName, phoneNumber }),
  });
}

/**
 * Fetches the rider's profile and authoritative onboarding status from the backend.
 * Screen state must be determined from this response, never client-decoded JWT claims.
 */
export async function getRiderProfile(): Promise<RiderProfile> {
  return authenticatedFetch<RiderProfile>('/riders/me', { method: 'GET' });
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
  }>('/subscriptions/me', { method: 'GET' });

  return {
    ...result,
    pricePesewas: toPesewas(result.pricePesewas),
  };
}

/**
 * Initializes a prepaid weekly Paystack hosted checkout session.
 * The backend passes an HTTPS callback URL to Paystack (custom schemes are rejected).
 */
export async function initializeSubscriptionCheckout(): Promise<CheckoutSessionResponse> {
  return authenticatedFetch<CheckoutSessionResponse>('/subscriptions/initialize', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
