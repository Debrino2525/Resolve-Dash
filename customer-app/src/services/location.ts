import * as Location from 'expo-location';
import { Point } from '../types/orders';

/** Map centre before we know where the customer is: Accra. */
export const ACCRA: Point = { lat: 5.6037, lng: -0.187 };

/**
 * One-off position for prefilling the pickup and showing nearby riders. Asks for "while using
 * the app" permission the first time; returns null if refused or no fix. Never tracked.
 */
export async function getCurrentPoint(ask = true): Promise<Point | null> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && ask && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
    const fix = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: fix.coords.latitude, lng: fix.coords.longitude };
  } catch {
    return null;
  }
}
