import './cryptoPolyfill';
import { createClient, Session } from '@supabase/supabase-js';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { secureSessionStorage } from './secureStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Fail-fast boundary assertion: throw immediately at startup if missing (no silent fallback defaults)
if (!supabaseUrl) {
  throw new Error('Fatal: EXPO_PUBLIC_SUPABASE_URL environment variable is missing.');
}
if (!supabasePublishableKey) {
  throw new Error('Fatal: EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable is missing.');
}

// Lets the in-app browser hand the OAuth redirect back to this screen (no-op on native).
WebBrowser.maybeCompleteAuthSession();

/**
 * Sessions live in the phone's encrypted keystore (see secureStorage.ts). Sign-in uses the PKCE
 * flow: Google returns a one-time code to the app, exchanged for a session with a verifier that
 * never leaves the phone, so an intercepted redirect is useless to anyone else.
 */
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: secureSessionStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

/**
 * Where Google sends the customer back after sign-in.
 * - Expo Go:          exp://<lan-ip>:8081/--/auth/callback
 * - Standalone build: ghanadash://auth/callback
 * Both must be allowed in Supabase → Authentication → URL Configuration → Redirect URLs
 * (add `exp://**` and `ghanadash://**`).
 */
export async function getOAuthRedirectUrl(): Promise<string> {
  const appUrl = Linking.createURL('auth/callback');
  // Development only: when running from Metro, the app's own scheme only works if this binary
  // registered it (a dev or store build). Expo Go doesn't, and recent Expo Go versions make
  // createURL return the app scheme anyway, so return through Expo Go's exp:// address instead.
  const hostUri = Constants.expoConfig?.hostUri;
  if (__DEV__ && hostUri && !appUrl.startsWith('exp')) {
    const ownSchemeWorks = await Linking.canOpenURL(appUrl).catch(() => false);
    if (!ownSchemeWorks) return `exp://${hostUri.replace(/\/+$/, '')}/--/auth/callback`;
  }
  return appUrl;
}

/** Thrown when the customer closes the Google sheet without finishing. Not shown as an error. */
export class AuthCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled');
    this.name = 'AuthCancelledError';
  }
}

/**
 * Signs in with Google through Supabase OAuth in an in-app browser session.
 * Works in Expo Go; a release build can later switch to the native Google button.
 */
export async function signInWithGoogle(): Promise<Session> {
  const redirectTo = await getOAuthRedirectUrl();
  if (__DEV__) console.log(`[auth] Google sign-in will return to: ${redirectTo}`);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    throw new Error(error?.message ?? 'Could not start Google sign-in');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    throw new AuthCancelledError();
  }

  // PKCE: the redirect carries ?code=… which only this app (holding the verifier) can redeem.
  const params = parseAuthCallback(result.url);
  if (params.error_description || params.error) {
    throw new Error(params.error_description ?? params.error);
  }
  if (!params.code) {
    throw new Error('Google sign-in did not return a code. Please try again.');
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(
    params.code,
  );
  if (sessionError || !sessionData.session) {
    throw new Error(sessionError?.message ?? 'Could not complete Google sign-in');
  }
  return sessionData.session;
}

/** Reads OAuth callback parameters from both the query string and the #fragment. */
export function parseAuthCallback(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const [beforeHash, fragment = ''] = url.split('#');
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';
  for (const part of [query, fragment]) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const [k, v = ''] = pair.split('=');
      out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    }
  }
  return out;
}

/** Existing account: email + password sign-in only (never creates an account). */
export async function signInWithEmail(email: string, password: string): Promise<Session> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.session) {
    throw new Error(friendlyAuthError(error?.message));
  }
  return data.session;
}

export type SignUpResult =
  | { status: 'signed_in'; session: Session }
  | { status: 'confirm_email'; email: string };

/**
 * New account: email + password sign-up. If the Supabase project requires email confirmation
 * (it currently does), there is no session yet and the customer must confirm via the emailed link.
 */
export async function signUpWithEmail(email: string, password: string): Promise<SignUpResult> {
  const cleanEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });
  if (error) {
    throw new Error(friendlyAuthError(error.message));
  }
  if (data.session) {
    return { status: 'signed_in', session: data.session };
  }
  // With confirmation on, Supabase also returns no session (and no error) for an email that is
  // already registered, to avoid revealing which emails exist. Either way: check your inbox.
  return { status: 'confirm_email', email: cleanEmail };
}

/**
 * Phone sign-in, step 1: Supabase creates a 6-digit code and our server texts it via mNotify
 * (Supabase "Send SMS" hook). Creates the account on first use. `phoneE164` is +233XXXXXXXXX.
 */
export async function sendPhoneSignInCode(phoneE164: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164 });
  if (error) throw new Error(friendlyAuthError(error.message));
}

/** Phone sign-in, step 2: the code from the SMS signs the person in. */
export async function verifyPhoneSignInCode(phoneE164: string, code: string): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({ phone: phoneE164, token: code, type: 'sms' });
  if (error || !data.session) throw new Error(friendlyAuthError(error?.message ?? 'invalid otp'));
  return data.session;
}

/**
 * Sign in with Apple (iOS only, needs a real build). Apple signs an identity token for a nonce we
 * choose; Supabase checks the token and the raw nonce, so a stolen token can't be replayed.
 */
export async function signInWithApple(): Promise<Session> {
  const AppleAuthentication = await import('expo-apple-authentication');
  const Crypto = await import('expo-crypto');
  const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new AuthCancelledError();
    throw err;
  }
  if (!credential.identityToken) throw new Error('Apple did not return a sign-in token. Please try again.');
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error || !data.session) throw new Error(friendlyAuthError(error?.message ?? 'Apple sign-in failed'));
  return data.session;
}

/**
 * True on iPhones where Sign in with Apple can be offered: a real build only. In Expo Go Apple
 * would sign the token for Expo Go's own app ID, which our Supabase project doesn't accept.
 */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Maps raw Supabase auth errors to messages a customer can act on. */
export function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'Wrong email or password. If you joined with Google, use "Continue with Google".';
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email first — open the link we sent to your inbox, then sign in.';
  }
  if (m.includes('already registered')) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (m.includes('password should be') || m.includes('weak password')) {
    return 'Choose a stronger password (at least 6 characters).';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  // Messages from our SMS hook are passed through by Supabase; check these before code errors.
  if (m.includes('ghana phone numbers')) {
    return 'GhanaDash works with Ghana mobile numbers (+233) only.';
  }
  if (m.includes('too many codes')) {
    return 'Too many codes for this number. Try again in an hour, or continue with Google or email.';
  }
  if ((m.includes('sms') || m.includes('otp')) && (m.includes('send') || m.includes('provider') || m.includes('hook'))) {
    return "We couldn't send the SMS right now. Try again in a minute, or continue with Google or email.";
  }
  if (m.includes('expired') || m.includes('invalid') || m.includes('otp')) {
    return 'That code is wrong or has expired. Check the SMS, or send a new code.';
  }
  return message || 'Authentication failed';
}

/**
 * Returns current valid access token for backend HTTP requests.
 */
export async function getValidAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) {
    throw new Error('User is not authenticated');
  }
  return data.session.access_token;
}
