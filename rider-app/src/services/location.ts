import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Map centre before the rider's position is known: the launch city, Sekondi-Takoradi (Market Circle). */
export const GHANA_DEFAULT_CENTER: LatLng = { latitude: 4.8975, longitude: -1.7553 };

export type LocationPermission = 'unknown' | 'granted' | 'denied';

/** One-off GPS fix (used to go online before continuous tracking starts). */
export async function getCurrentCoords(): Promise<LatLng | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30_000 });
    if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
  } catch {
    return null;
  }
}

export interface RiderLocationState {
  coords: LatLng | null;
  /** Metres, from the GPS fix. */
  accuracy: number | null;
  permission: LocationPermission;
  error: string | null;
  /** Asks for "while using the app" permission. Returns true if granted. */
  requestPermission: () => Promise<boolean>;
}

/**
 * Foreground-only rider location. Tracks continuously only while `tracking` is true (online or
 * on a delivery). The dispatch heartbeat shares these positions with the server for order
 * matching and customer tracking; nothing is tracked while offline.
 */
export function useRiderLocation(tracking: boolean, navigating = false): RiderLocationState {
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [permission, setPermission] = useState<LocationPermission>('unknown');
  const [error, setError] = useState<string | null>(null);
  const subscription = useRef<Location.LocationSubscription | null>(null);

  // Read the current permission without prompting; show a last-known position if allowed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      setPermission(status.granted ? 'granted' : status.canAskAgain ? 'unknown' : 'denied');
      if (status.granted) {
        const last = await Location.getLastKnownPositionAsync();
        if (!cancelled && last) setCoords(last.coords);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const res = await Location.requestForegroundPermissionsAsync();
    setPermission(res.granted ? 'granted' : 'denied');
    return res.granted;
  }, []);

  useEffect(() => {
    if (!tracking || permission !== 'granted') return;
    let cancelled = false;
    void (async () => {
      try {
        setError(null);
        subscription.current = await Location.watchPositionAsync(
          // Turn-by-turn needs ~1 fix/second; idle on-duty tracking can be gentler on battery.
          navigating
            ? { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 1000 }
            : { accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 5000 },
          (pos) => {
            if (cancelled) return;
            setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            setAccuracy(pos.coords.accuracy ?? null);
          },
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not read your location. Is GPS on?');
        }
      }
    })();
    return () => {
      cancelled = true;
      subscription.current?.remove();
      subscription.current = null;
    };
  }, [tracking, permission, navigating]);

  return { coords, accuracy, permission, error, requestPermission };
}
