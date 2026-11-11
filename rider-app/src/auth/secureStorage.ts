import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Supabase session storage in the phone's hardware-backed keystore (Android Keystore / iOS
 * Keychain) instead of plain-text AsyncStorage. Works in Expo Go and in store builds.
 *
 * SecureStore values should stay under ~2 KB, and a Supabase session is larger, so each value is
 * split into chunks: `<key>.n` holds the chunk count, `<key>.0..n-1` the parts.
 *
 * Sessions saved by older app versions in AsyncStorage are moved over on first read, so nobody is
 * signed out by the upgrade.
 */
const CHUNK = 1800;
const safeKey = (key: string): string => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function removeChunks(key: string): Promise<void> {
  const k = safeKey(key);
  const count = Number((await SecureStore.getItemAsync(`${k}.n`)) ?? 0);
  await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${k}.${i}`)));
  await SecureStore.deleteItemAsync(`${k}.n`);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const countRaw = await SecureStore.getItemAsync(`${k}.n`);
    if (countRaw !== null) {
      const parts = await Promise.all(
        Array.from({ length: Number(countRaw) }, (_, i) => SecureStore.getItemAsync(`${k}.${i}`)),
      );
      return parts.some((p) => p === null) ? null : parts.join('');
    }
    // One-time migration from AsyncStorage.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) {
      await secureSessionStorage.setItem(key, legacy);
      await AsyncStorage.removeItem(key);
    }
    return legacy;
  },

  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    await removeChunks(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${k}.${i}`, p)));
    await SecureStore.setItemAsync(`${k}.n`, String(parts.length));
  },

  async removeItem(key: string): Promise<void> {
    await removeChunks(key);
    await AsyncStorage.removeItem(key);
  },
};
