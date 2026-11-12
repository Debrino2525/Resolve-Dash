import { File } from 'expo-file-system';
import { getValidAccessToken } from '../auth/supabase';
import type { CallState } from '../components/CallScreen';
import { PickedPhoto } from '../services/photos';
import { DispatchState } from '../types/dispatch';
import { DocumentChecklist, PickedFile, RiderDocumentType } from '../types/documents';
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

// Release builds must talk to the real HTTPS API: a store build pointing at a laptop IP or plain
// HTTP would leak tokens and simply not work (Android/iOS block cleartext traffic).
if (!__DEV__ && !/^https:\/\//.test(API_BASE_URL)) {
  throw new Error(`Fatal: EXPO_PUBLIC_API_URL must be https:// in release builds (got ${API_BASE_URL}).`);
}

/** Backend error carrying the HTTP status, so callers can tell 404 "no profile yet" apart. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function authenticatedFetch<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 6000,
): Promise<T> {
  const token = await getValidAccessToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        // For FormData uploads the runtime must set multipart/form-data with its boundary.
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
    });

    clearTimeout(timeoutId);

    const body = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      data?: T;
      error?: { code?: string; message?: string };
      message?: string | string[];
    };

    if (!response.ok) {
      const raw = body.error?.message ?? body.message;
      const errorMsg =
        (Array.isArray(raw) ? raw[0] : raw) ??
        `HTTP request failed with status ${response.status}`;
      throw new ApiError(errorMsg, response.status);
    }

    return (body.data ?? body) as T;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        `Connection timed out: Backend at ${API_BASE_URL} is unreachable. Ensure phone is on the same Wi-Fi.`,
      );
    }
    throw err;
  }
}

/**
 * Submits initial onboarding profile after authentication.
 * Creates rider row with status 'PENDING_VERIFICATION'.
 */
/** `phoneVerificationToken` is null when the rider signed in with their (already verified) phone. */
export async function onboardRider(
  fullName: string,
  phoneVerificationToken: string | null,
): Promise<RiderProfile> {
  return authenticatedFetch<RiderProfile>('/riders/onboard', {
    method: 'POST',
    body: JSON.stringify({ fullName, ...(phoneVerificationToken ? { phoneVerificationToken } : {}) }),
  });
}

export interface PhoneCodeSent {
  verificationId: string;
  phoneNumber: string;
  expiresAt: string;
  resendAfterSeconds: number;
}

/** Asks the backend to text a 6-digit code (via mNotify) to this Ghana number (E.164). */
export async function sendPhoneVerificationCode(phoneNumber: string): Promise<PhoneCodeSent> {
  return authenticatedFetch<PhoneCodeSent>(
    '/riders/phone/send-code',
    { method: 'POST', body: JSON.stringify({ phoneNumber }) },
    15000, // the SMS gateway can be slow
  );
}

/** Checks the SMS code; returns a short-lived proof to pass to onboardRider. */
export async function verifyPhoneCode(
  verificationId: string,
  code: string,
): Promise<{ phoneNumber: string; phoneVerificationToken: string }> {
  return authenticatedFetch('/riders/phone/verify', {
    method: 'POST',
    body: JSON.stringify({ verificationId, code }),
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

/** The rider's compliance documents and profile photo, with their review status. */
export async function getMyDocuments(): Promise<DocumentChecklist> {
  return authenticatedFetch<DocumentChecklist>('/riders/me/documents', { method: 'GET' });
}

/**
 * Uploads (or replaces) one document: photo/PDF + number + expiry (YYYY-MM-DD).
 * Returns the updated checklist.
 */
export async function uploadDocument(
  docType: RiderDocumentType,
  fields: { documentNumber: string; expiryDate: string },
  file: PickedFile,
): Promise<DocumentChecklist> {
  const form = new FormData();
  form.append('documentNumber', fields.documentNumber);
  form.append('expiryDate', fields.expiryDate);
  // Expo's fetch (SDK 52+) rejects React Native's old { uri, name, type } parts with
  // "Unsupported FormDataPart implementation". It accepts any object exposing name, type
  // and bytes(): we read the picked photo's bytes with expo-file-system's File.
  const localFile = new File(file.uri);
  form.append('file', {
    name: file.fileName,
    type: file.mimeType,
    bytes: () => localFile.bytes(),
  } as unknown as Blob);
  return authenticatedFetch<DocumentChecklist>(
    `/riders/me/documents/${docType}`,
    { method: 'POST', body: form },
    60000, // photos over mobile data can be slow
  );
}

// ---------- Live dispatch ----------

export interface PresenceUpdate {
  online: boolean;
  lat?: number;
  lng?: number;
  heading?: number | null;
  accuracy?: number | null;
}

/** On/off duty and the ~5 s location heartbeat. Returns the current offer and job. */
export async function updatePresence(update: PresenceUpdate): Promise<DispatchState> {
  return authenticatedFetch<DispatchState>('/riders/me/presence', {
    method: 'PUT',
    body: JSON.stringify(update),
  });
}

/** Where the server sends this phone's push notifications (Expo push token). */
export async function registerPushToken(token: string, app: 'rider', platform: 'ios' | 'android'): Promise<void> {
  await authenticatedFetch<void>('/push/token', { method: 'PUT', body: JSON.stringify({ token, app, platform }) });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await authenticatedFetch<void>('/push/token', { method: 'DELETE', body: JSON.stringify({ token }) });
}

export async function getDispatchState(): Promise<DispatchState> {
  return authenticatedFetch<DispatchState>('/riders/me/dispatch', { method: 'GET' });
}

export async function acceptOffer(offerId: string): Promise<DispatchState> {
  return authenticatedFetch<DispatchState>(`/riders/me/offers/${offerId}/accept`, { method: 'POST' });
}

export async function declineOffer(offerId: string): Promise<DispatchState> {
  return authenticatedFetch<DispatchState>(`/riders/me/offers/${offerId}/decline`, { method: 'POST' });
}

export async function markPickedUp(jobId: string): Promise<DispatchState> {
  return authenticatedFetch<DispatchState>(`/riders/me/jobs/${jobId}/picked-up`, { method: 'POST' });
}

// ---------- In-app calls with the customer ----------

export interface CallJoinResponse {
  call: CallState;
  appId: string;
  channel: string;
  token: string;
  uid: number;
}

export const startCall = (orderId: string): Promise<CallJoinResponse> =>
  authenticatedFetch<CallJoinResponse>(`/orders/${orderId}/call`, { method: 'POST', body: '{}' }, 12000);
export const answerCall = (orderId: string): Promise<CallJoinResponse> =>
  authenticatedFetch<CallJoinResponse>(`/orders/${orderId}/call/answer`, { method: 'POST', body: '{}' }, 12000);
export const endCall = (orderId: string): Promise<unknown> =>
  authenticatedFetch<unknown>(`/orders/${orderId}/call/end`, { method: 'POST', body: '{}' });

/** Completes the delivery with the 4-digit PIN the customer/receiver gives the rider. */
export async function markDelivered(jobId: string, pin: string): Promise<DispatchState> {
  return authenticatedFetch<DispatchState>(`/riders/me/jobs/${jobId}/delivered`, {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

/** Multi-stop: hands over at a drop-off before the final one, with that receiver's PIN. */
export async function markStopDelivered(jobId: string, index: number, pin: string): Promise<DispatchState> {
  return authenticatedFetch<DispatchState>(`/riders/me/jobs/${jobId}/stops/${index}/delivered`, {
    method: 'POST',
    body: JSON.stringify({ pin }),
  });
}

/** Multi-stop: couldn't hand over at this drop-off; records why so the customer sees it. */
export async function markStopFailed(jobId: string, index: number, reason: string): Promise<DispatchState> {
  return authenticatedFetch<DispatchState>(`/riders/me/jobs/${jobId}/stops/${index}/failed`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/** Hands an accepted (not yet picked up) job back to dispatch. */
export async function releaseJob(jobId: string): Promise<DispatchState> {
  return authenticatedFetch<DispatchState>(`/riders/me/jobs/${jobId}/release`, { method: 'POST' });
}

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
  authenticatedFetch<ChatThread>(`/orders/${orderId}/messages`, { method: 'GET' });

export const sendChatMessage = (orderId: string, body: string): Promise<ChatThread> =>
  authenticatedFetch<ChatThread>(`/orders/${orderId}/messages`, { method: 'POST', body: JSON.stringify({ body }) });

export const sendChatPhoto = (orderId: string, photo: PickedPhoto, caption?: string): Promise<ChatThread> =>
  authenticatedFetch<ChatThread>(
    `/orders/${orderId}/messages/photo`,
    { method: 'POST', body: photoForm(photo, caption ? { caption } : {}) },
    60000,
  );
