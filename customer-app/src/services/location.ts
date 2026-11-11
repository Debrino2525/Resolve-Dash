import * as Location from 'expo-location';
import { Point } from '../types/orders';

/** Map centre before we know where the customer is: the launch city, Sekondi-Takoradi (Market Circle). */
export const DEFAULT_CENTRE: Point = { lat: 4.8975, lng: -1.7553 };

/** A fix this good can prefill the pickup; worse ones must be set on the map. */
export const GOOD_ACCURACY_M = 50;

export interface Fix {
  point: Point;
  /** Radius of uncertainty in metres (null if the phone didn't say). */
  accuracy: number | null;
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/**
 * One-off, fresh, high-accuracy position for the pickup and the map. Asks for "while using the
 * app" permission the first time; returns null if refused or no fix. Never tracked.
 *
 * A cached position is used only if it is recent (≤15 s) and already precise (≤30 m); otherwise
 * we wait up to 12 s for a real GPS fix, which is usually 5–15 m outdoors.
 */
export async function getCurrentFix(ask = true): Promise<Fix | null> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && ask && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;

    const last = await Location.getLastKnownPositionAsync({ maxAge: 15_000, requiredAccuracy: 30 });
    const pos =
      last ??
      (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }), 12_000)) ??
      (await Location.getLastKnownPositionAsync());
    if (!pos) return null;
    return {
      point: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      accuracy: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
    };
  } catch {
    return null;
  }
}

/**
 * The phone's last known position, instantly and without waiting for GPS: good enough to centre
 * the map and bias search while the precise fix is on its way. Never asks for permission; null
 * if not granted or the phone has no position yet.
 */
export async function getQuickPoint(): Promise<Point | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const last = await Location.getLastKnownPositionAsync();
    return last ? { lat: last.coords.latitude, lng: last.coords.longitude } : null;
  } catch {
    return null;
  }
}

/** Position only (for centring maps). */
export async function getCurrentPoint(ask = true): Promise<Point | null> {
  return (await getCurrentFix(ask))?.point ?? null;
}
