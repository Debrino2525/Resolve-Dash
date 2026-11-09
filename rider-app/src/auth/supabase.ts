import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, Session } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Fail-fast boundary assertion: throw immediately at startup if missing (no silent fallback defaults)
if (!supabaseUrl) {
  throw new Error('Fatal: EXPO_PUBLIC_SUPABASE_URL environment variable is missing.');
}
if (!supabasePublishableKey) {
  throw new Error('Fatal: EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable is missing.');
}

/**
 * Uses AsyncStorage for Supabase session persistence in Expo Go.
 *
 * NOTE ON EXPO GO vs PRODUCTION BUILD:
 * - Expo Go: expo-secure-store is not available; AsyncStorage is the correct storage adapter.
 * - Production standalone build: Migrate to ChunkedSecureStoreAdapter (see SETUP.md §6)
 *   to get hardware-backed encrypted storage. AsyncStorage is plaintext on disk.
 *
 * AsyncStorage supports values up to ~6 MB on both iOS and Android — well above
 * the size of any Supabase JWT session payload.
 */
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Signs in with Email + Password or automatically registers new rider.
 * Bypasses email rate limits completely when 'Confirm email' is disabled in Supabase.
 */
export async function signInOrRegisterWithPassword(
  email: string,
  password: string,
): Promise<Session> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Try sign in first
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (signInData.session) {
    return signInData.session;
  }

  // 2. If user doesn't exist, register them
  const isUserNotFound =
    signInError?.message.toLowerCase().includes('invalid login credentials') ||
    signInError?.message.toLowerCase().includes('user not found');

  if (isUserNotFound) {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    });

    if (signUpError) {
      throw new Error(signUpError.message);
    }

    if (signUpData.session) {
      return signUpData.session;
    }

    // If confirmation is required by Supabase config
    throw new Error(
      'Account created! Please check your email or disable "Confirm email" in Supabase Auth settings to log in instantly.',
    );
  }

  throw new Error(signInError?.message ?? 'Authentication failed');
}

/**
 * Initiates Email OTP login via Supabase Auth.
 * Sends a 6-digit confirmation code directly to the rider's email.
 */
export async function sendEmailOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) {
    throw new Error(`Failed to send email verification code: ${error.message}`);
  }
}

/**
 * Verifies the 6-digit OTP token sent to the rider's email.
 */
export async function verifyEmailOtp(email: string, token: string): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });

  if (error || !data.session) {
    throw new Error(`Invalid or expired verification code: ${error?.message ?? 'No session returned'}`);
  }

  return data.session;
}

/**
 * Initiates Phone OTP login via Supabase Auth.
 * Phone number must be in E.164 format (e.g. +233241234567).
 */
export async function sendPhoneOtp(phoneNumber: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneNumber,
  });

  if (error) {
    throw new Error(`Failed to send OTP: ${error.message}`);
  }
}

/**
 * Verifies the 6-digit SMS OTP token for the phone number.
 */
export async function verifyPhoneOtp(phoneNumber: string, token: string): Promise<Session> {
  const { data, error } = await supabase.auth.verifyOtp({
    phone: phoneNumber,
    token,
    type: 'sms',
  });

  if (error || !data.session) {
    throw new Error(`Invalid or expired OTP: ${error?.message ?? 'No session returned'}`);
  }

  return data.session;
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
