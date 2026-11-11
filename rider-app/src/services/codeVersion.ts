import * as Updates from 'expo-updates';

/**
 * Which app code this phone is running, for the Account footer: "update 1a2b3c4d" once an
 * over-the-air update is applied, "built-in" for the code shipped in the installed build,
 * "dev" in development. Lets us confirm a phone has the latest update.
 */
export function codeVersionLabel(): string {
  try {
    if (__DEV__ || !Updates.isEnabled) return 'dev';
    if (Updates.isEmbeddedLaunch || !Updates.updateId) return 'built-in';
    return `update ${Updates.updateId.slice(0, 8)}`;
  } catch {
    return 'unknown';
  }
}
