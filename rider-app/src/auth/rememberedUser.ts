import * as SecureStore from 'expo-secure-store';

/**
 * The last person who used GhanaDash on this phone, for the "Welcome back" screen after
 * signing out. Kept only on this phone (encrypted keystore), never sent anywhere. "Use another
 * account" forgets it.
 */
export interface RememberedUser {
  firstName: string;
  /** +233XXXXXXXXX: prefilled for a one-tap phone sign-in. */
  phone: string;
}

const KEY = 'ghanadash.rider.lastUser';

export async function getRememberedUser(): Promise<RememberedUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<RememberedUser>;
    return typeof v.firstName === 'string' && typeof v.phone === 'string'
      ? { firstName: v.firstName, phone: v.phone }
      : null;
  } catch {
    return null;
  }
}

export async function rememberUser(fullName: string, phone: string): Promise<void> {
  const firstName = fullName.trim().split(/\s+/)[0] ?? '';
  if (!firstName || !phone) return;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify({ firstName, phone }));
  } catch {
    // Best effort: the Welcome back screen is a convenience.
  }
}

export async function forgetRememberedUser(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // ignore
  }
}
