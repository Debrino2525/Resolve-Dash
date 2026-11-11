import { getValidAccessToken } from '../auth/supabase';
import { CustomerOrder, CustomerProfile, DeliveryDraft, Point, Quote } from '../types/orders';

/**
 * Backend base URL. In Expo Go on a phone, 'localhost' is the phone itself: set
 * EXPO_PUBLIC_API_URL to your computer's LAN IP, e.g. http://192.168.1.42:3000.
 */
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

// Release builds must talk to the real HTTPS API: a store build pointing at a laptop IP or plain
// HTTP would leak tokens and simply not work (Android/iOS block cleartext traffic).
if (!__DEV__ && !/^https:\/\//.test(API_BASE_URL)) {
  throw new Error(`Fatal: EXPO_PUBLIC_API_URL must be https:// in release builds (got ${API_BASE_URL}).`);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function api<T>(path: string, options: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const token = await getValidAccessToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });
    const body = (await response.json().catch(() => ({}))) as {
      data?: T;
      error?: { message?: string };
      message?: string | string[];
    };
    if (!response.ok) {
      const raw = body.error?.message ?? body.message;
      const msg = (Array.isArray(raw) ? raw[0] : raw) ?? `Request failed (${response.status})`;
      throw new ApiError(msg, response.status);
    }
    return (body.data ?? body) as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('GhanaDash is taking too long to respond. Check your internet and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------- Account ----------

export const getCustomerProfile = (): Promise<CustomerProfile> => api('/customers/me');

export interface PhoneCodeSent {
  verificationId: string;
  phoneNumber: string;
  expiresAt: string;
  resendAfterSeconds: number;
}

export const sendPhoneVerificationCode = (phoneNumber: string): Promise<PhoneCodeSent> =>
  api('/customers/phone/send-code', { method: 'POST', body: JSON.stringify({ phoneNumber }) }, 15000);

export const verifyPhoneCode = (
  verificationId: string,
  code: string,
): Promise<{ phoneNumber: string; phoneVerificationToken: string }> =>
  api('/customers/phone/verify', { method: 'POST', body: JSON.stringify({ verificationId, code }) });

export const onboardCustomer = (
  fullName: string,
  phoneVerificationToken: string,
): Promise<CustomerProfile> =>
  api('/customers/onboard', {
    method: 'POST',
    body: JSON.stringify({ fullName, phoneVerificationToken }),
  });

// ---------- Deliveries ----------

export const getQuote = (pickup: Point, dropoff: Point): Promise<Quote> =>
  api(
    '/orders/quote',
    {
      method: 'POST',
      body: JSON.stringify({
        pickup: { lat: pickup.lat, lng: pickup.lng },
        dropoff: { lat: dropoff.lat, lng: dropoff.lng },
      }),
    },
    12000,
  );

export const createOrder = (draft: DeliveryDraft, quoteToken: string): Promise<CustomerOrder> =>
  api('/orders', { method: 'POST', body: JSON.stringify({ ...draft, quoteToken }) }, 12000);

export const listOrders = (): Promise<CustomerOrder[]> => api('/orders');

export const getOrder = (id: string): Promise<CustomerOrder> => api(`/orders/${id}`);

export const cancelOrder = (id: string, reason?: string): Promise<CustomerOrder> =>
  api(`/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) });

export const rateOrder = (
  id: string,
  stars: number,
  tags: string[],
  comment?: string,
): Promise<CustomerOrder> =>
  api(`/orders/${id}/rate`, {
    method: 'POST',
    body: JSON.stringify({ stars, tags, ...(comment ? { comment } : {}) }),
  });

export const nearbyRiders = (p: Point): Promise<{ count: number; riders: Point[] }> =>
  api(`/orders/nearby-riders?lat=${p.lat.toFixed(5)}&lng=${p.lng.toFixed(5)}`);
