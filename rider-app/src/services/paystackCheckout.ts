import * as WebBrowser from 'expo-web-browser';
import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import { getSubscriptionStatus, initializeSubscriptionCheckout } from '../api/backendClient';
import { SubscriptionDetails } from '../types/subscription';

/**
 * EXPO GO COMPATIBILITY NOTE:
 * In Expo Go the custom scheme ghanadash-rider:// is not registered, so
 * WebBrowser.openAuthSessionAsync cannot auto-dismiss on the Paystack redirect.
 * We use openBrowserAsync instead: the user completes payment in the in-app browser,
 * closes it manually (or the backend redirect HTML auto-closes it via window.close()),
 * and then we poll the backend for authoritative status.
 *
 * PRODUCTION (standalone build):
 * Switch back to openAuthSessionAsync(url, 'ghanadash-rider://subscription-callback')
 * and register the scheme in app.json. The browser will auto-dismiss on redirect,
 * giving a faster UX signal. Polling still runs either way — the deep link is
 * purely cosmetic; access is NEVER granted based on it locally.
 */

// Fibonacci-stepped backoff: total coverage ~32 seconds after browser close
const BACKOFF_INTERVALS_MS = [1_000, 2_000, 3_000, 5_000, 8_000, 13_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls the backend with progressive backoff until canAcceptOrders is true
 * or all intervals are exhausted.
 */
async function pollBackendUntilActive(): Promise<SubscriptionDetails> {
  let latest = await getSubscriptionStatus();
  if (latest.canAcceptOrders) return latest;

  for (const interval of BACKOFF_INTERVALS_MS) {
    await sleep(interval);
    latest = await getSubscriptionStatus();
    if (latest.canAcceptOrders) return latest;
  }

  return latest;
}

/**
 * Opens a Paystack hosted checkout session and polls the backend afterward.
 *
 * SECURITY INVARIANT: The mobile client NEVER grants access locally.
 * canAcceptOrders is sourced exclusively from the backend response.
 */
export async function executePaystackSubscriptionPayment(): Promise<SubscriptionDetails> {
  // 1. Ask backend to initialize the checkout session
  const session = await initializeSubscriptionCheckout();

  // 2. Listen for app returning to foreground (covers manual browser close)
  let appStateSubscription: NativeEventSubscription | null = null;
  const onResumePromise = new Promise<void>((resolve) => {
    appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') resolve();
    });
  });

  try {
    // 3. Open Paystack in an in-app browser. Works in Expo Go and production builds.
    //    In Expo Go there is no auto-dismiss on redirect — user taps "Done".
    //    In a standalone build with the custom scheme registered, replace with:
    //    await WebBrowser.openAuthSessionAsync(session.authorizationUrl, 'ghanadash-rider://subscription-callback');
    await WebBrowser.openBrowserAsync(session.authorizationUrl);

    // 4. Wait up to 500 ms for app-resume signal (may already have fired on browser close)
    await Promise.race([onResumePromise, sleep(500)]);

    // 5. Poll backend for server-verified credit — this is the authoritative gate
    return await pollBackendUntilActive();
  } finally {
    if (appStateSubscription) {
      (appStateSubscription as NativeEventSubscription).remove();
    }
  }
}
