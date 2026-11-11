import { requireOptionalNativeModule } from 'expo';

/**
 * React Native (Hermes) has no Web Crypto. Without it, Supabase's PKCE sign-in falls back to a
 * Math.random() verifier and a "plain" challenge (verifier sent in the clear). This provides the
 * two pieces it needs, backed by the OS's secure random generator and native SHA-256:
 *   crypto.getRandomValues  and  crypto.subtle.digest('SHA-256', …)
 *
 * Store/dev builds always include expo-crypto. Some Expo Go installs don't ship its native module;
 * there we skip the polyfill (development only) instead of crashing at start-up.
 * Import this before creating the Supabase client.
 */
type SubtleLike = {
  digest: (algorithm: string | { name: string }, data: BufferSource) => Promise<ArrayBuffer>;
};
type CryptoLike = { getRandomValues?: <T extends ArrayBufferView>(a: T) => T; subtle?: SubtleLike };

const hasNativeCrypto = requireOptionalNativeModule('ExpoCrypto') !== null;

if (hasNativeCrypto) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExpoCrypto = require('expo-crypto') as typeof import('expo-crypto');
  const g = globalThis as unknown as { crypto?: CryptoLike };
  const target: CryptoLike = g.crypto ?? {};

  if (typeof target.getRandomValues !== 'function') {
    target.getRandomValues = <T extends ArrayBufferView>(array: T): T =>
      ExpoCrypto.getRandomValues(array as unknown as Uint8Array) as unknown as T;
  }
  if (!target.subtle || typeof target.subtle.digest !== 'function') {
    target.subtle = {
      digest: (algorithm, data) => {
        const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
        if (name.toUpperCase() !== 'SHA-256') {
          return Promise.reject(new Error(`Unsupported digest algorithm: ${name}`));
        }
        return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
      },
    };
  }
  if (!g.crypto) {
    Object.defineProperty(globalThis, 'crypto', { value: target, configurable: true });
  }
} else if (!__DEV__) {
  throw new Error('Fatal: ExpoCrypto native module missing from this build.');
} else {
  console.warn('[auth] ExpoCrypto not available in this Expo Go; PKCE uses a weaker dev fallback.');
}
