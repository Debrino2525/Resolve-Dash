import { File } from 'expo-file-system';
import { getValidAccessToken } from '../auth/supabase';
import { PickedPhoto } from '../services/photos';
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
        // FormData uploads: the runtime sets multipart/form-data with its boundary.
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
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

export const createOrder = (
  draft: DeliveryDraft,
  quoteToken: string,
  packagePhotoPath: string | null = null,
): Promise<CustomerOrder> => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { packagePhoto, ...fields } = draft;
  return api(
    '/orders',
    { method: 'POST', body: JSON.stringify({ ...fields, quoteToken, packagePhotoPath }) },
    12000,
  );
};

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

/** Your own recent pickup/drop-off spots (newest first), for one-tap reuse. */
export interface RecentPlace {
  lat: number;
  lng: number;
  address: string;
  landmark: string | null;
  gpsCode: string | null;
  lastUsedAt: string;
}

export const getRecentPlaces = (): Promise<RecentPlace[]> => api('/orders/recent-places');

export const nearbyRiders = (p: Point): Promise<{ count: number; riders: Point[] }> =>
  api(`/orders/nearby-riders?lat=${p.lat.toFixed(5)}&lng=${p.lng.toFixed(5)}`);

// ---------- Photos and chat (package photo, customer ↔ rider messages) ----------

/** Full URL for an API path (used by AuthImage, which adds the sign-in header). */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export interface ChatMessage {
  id: string;
  senderRole: 'CUSTOMER' | 'RIDER';
  mine: boolean;
  body: string | null;
  hasPhoto: boolean;
  createdAt: string;
}

export interface ChatThread {
  orderId: string;
  myRole: 'CUSTOMER' | 'RIDER';
  open: boolean;
  messages: ChatMessage[];
}

/** multipart form with the photo as `file` (Expo fetch needs name/type/bytes parts). */
function photoForm(photo: PickedPhoto, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const local = new File(photo.uri);
  form.append('file', {
    name: photo.name,
    type: photo.type,
    bytes: () => local.bytes(),
  } as unknown as Blob);
  return form;
}

export const getChatThread = (orderId: string): Promise<ChatThread> =>
  api<ChatThread>(`/orders/${orderId}/messages`, { method: 'GET' });

export const sendChatMessage = (orderId: string, body: string): Promise<ChatThread> =>
  api<ChatThread>(`/orders/${orderId}/messages`, { method: 'POST', body: JSON.stringify({ body }) });

export const sendChatPhoto = (orderId: string, photo: PickedPhoto, caption?: string): Promise<ChatThread> =>
  api<ChatThread>(
    `/orders/${orderId}/messages/photo`,
    { method: 'POST', body: photoForm(photo, caption ? { caption } : {}) },
    60000,
  );

/** Before booking: upload the item photo; pass the returned path to createOrder. */
export const uploadPackagePhoto = (photo: PickedPhoto): Promise<{ photoPath: string }> =>
  api<{ photoPath: string }>('/orders/package-photo', { method: 'POST', body: photoForm(photo) }, 60000);

// ---------- Place search (Google Places via our server; key never in the app) ----------

export interface ServerPlaceSuggestion {
  placeId: string;
  title: string;
  subtitle: string;
  /** Sent by OpenStreetMap/HERE search (no details lookup needed). */
  lat?: number;
  lng?: number;
  source?: 'google' | 'osm' | 'here';
}

export const placesAutocomplete = (
  q: string,
  session: string,
  near: Point | null,
): Promise<{ enabled: boolean; provider?: 'google' | 'osm'; suggestions: ServerPlaceSuggestion[] }> => {
  const params = new URLSearchParams({ q, session });
  if (near) {
    params.set('lat', near.lat.toFixed(4));
    params.set('lng', near.lng.toFixed(4));
  }
  return api(`/places/autocomplete?${params.toString()}`);
};

export const placeDetails = (
  id: string,
  session: string,
): Promise<{ placeId: string; name: string; address: string; lat: number; lng: number }> =>
  api(`/places/details?${new URLSearchParams({ id, session }).toString()}`);
