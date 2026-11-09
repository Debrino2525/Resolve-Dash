import { AppState, AppStateStatus } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  initializeSubscriptionCheckout,
  getSubscriptionStatus,
} from '../api/backendClient';
import { SubscriptionDetails } from '../types/subscription';

/**
 * PAYSTACK CUSTOM-SCHEME CALLBACK URL RESTRICTION:
 * Paystack's API validates the callback_url parameter against RFC HTTP/HTTPS schemes.
 * Directly passing a custom URI scheme (such as 'ghanadash-rider://...') to Paystack
 * will cause Paystack's API to return a 400 Bad Request error: "Invalid callback_url".
 *
 * THE STANDARD ARCHITECTURAL BRIDGE:
 * 1. The backend passes an HTTPS endpoint as callback_url (e.g. https://api.yourdomain.com/subscriptions/callback).
 * 2. When payment completes, Paystack redirects the browser to that HTTPS URL.
 * 3. That backend web route serves an HTTP 302 or HTML redirect to 'ghanadash-rider://subscription-callback',
 *    which safely launches the mobile app back into the foreground.
 */

// Stepped fibonacci backoff intervals (total polling window ~32 seconds)
const BACKOFF_INTERVALS_MS = [1000, 2000, 3000, 5000, 8000, 13000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls the backend authoritative subscription endpoint with progressive backoff.
 */
async function pollBackendUntilActive(): Promise<SubscriptionDetails> {
  let latest = await getSubscriptionStatus();
  if (latest.canAcceptOrders) {
    return latest;
  }

  for (const interval of BACKOFF_INTERVALS_MS) {
    await sleep(interval);
    latest = await getSubscriptionStatus();
    if (latest.canAcceptOrders) {
      return latest;
    }
  }

  return latest;
}

/**
 * Initiates the Paystack hosted checkout session and opens the secure browser sheet.
 *
 * CRITICAL PROCESS & SECURITY RULE:
 * The return deep link ('ghanadash-rider://subscription-callback') is treated
 * STRICTLY as a UX return trigger. The mobile client NEVER grants access or marks
 * a subscription active locally. Access is granted ONLY by the backend's response.
 */
export async function executePaystackSubscriptionPayment(): Promise<SubscriptionDetails> {
  // 1. Initialize checkout session from backend
  const session = await initializeSubscriptionCheckout();

  // 2. Setup AppState listener to trigger immediate re-check when app returns from background
  let appStateSubscription: { remove: () => void } | null = null;
  const onResumePromise = new Promise<void>((resolve) => {
    appStateSubscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          resolve();
        }
      },
    );
  });

  try {
    // 3. Open browser session
    const redirectUrl = 'ghanadash-rider://subscription-callback';
    await WebBrowser.openAuthSessionAsync(session.authorizationUrl, redirectUrl);

    // 4. Wait for either browser close or app resume event
    await Promise.race([onResumePromise, sleep(500)]);

    // 5. Poll backend for server-verified credit (with stepped backoff)
    return await pollBackendUntilActive();
  } finally {
    if (appStateSubscription) {
      (appStateSubscription as { remove: () => void }).remove();
    }
  }
}
