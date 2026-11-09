import * as SecureStore from 'expo-secure-store';
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
 * Large Value Chunking Storage Adapter for Expo SecureStore.
 *
 * ANDROID 2048-BYTE LIMIT MITIGATION:
 * On Android, Expo SecureStore stores values in encrypted SharedPreferences with
 * a hard 2048-byte (2 KB) value size limit per key. Supabase Auth session payloads
 * containing user metadata or multiple JWT claims can easily exceed 2 KB.
 *
 * This adapter splits values larger than 1800 bytes into indexed chunks (key.0, key.1...)
 * and reconstructs them transparently on retrieval, adhering to official Supabase/Expo guidance.
 */
const CHUNK_SIZE = 1800;

const ChunkedSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    // Check if chunk count index exists
    const countStr = await SecureStore.getItemAsync(`${key}.chunks`);
    if (!countStr) {
      // Legacy or single small item
      return SecureStore.getItemAsync(key);
    }

    const chunkCount = parseInt(countStr, 10);
    const chunks: string[] = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunk = await SecureStore.getItemAsync(`${key}.${i}`);
      if (!chunk) return null;
      chunks.push(chunk);
    }
    return chunks.join('');
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (value.length <= CHUNK_SIZE) {
      // Small payload: clear any prior chunk metadata and write directly
      await SecureStore.deleteItemAsync(`${key}.chunks`);
      return SecureStore.setItemAsync(key, value);
    }

    // Split across chunks
    const chunkCount = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}.chunks`, String(chunkCount));

    for (let i = 0; i < chunkCount; i++) {
      const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await SecureStore.setItemAsync(`${key}.${i}`, chunk);
    }
    // Delete base key if previously existed
    await SecureStore.deleteItemAsync(key);
  },

  removeItem: async (key: string): Promise<void> => {
    const countStr = await SecureStore.getItemAsync(`${key}.chunks`);
    if (countStr) {
      const chunkCount = parseInt(countStr, 10);
      for (let i = 0; i < chunkCount; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`);
      }
      await SecureStore.deleteItemAsync(`${key}.chunks`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: ChunkedSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

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
export async function verifyPhoneOtp(
  phoneNumber: string,
  token: string,
): Promise<Session> {
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
