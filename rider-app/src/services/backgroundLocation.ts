import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { ApiError, updatePresence } from '../api/backendClient';

/**
 * Location while the screen is off or the rider is in another app (navigation, WhatsApp...).
 *
 * Runs only while the rider is online or on a delivery, and stops when they go offline. On
 * Android it is a foreground service with a permanent notification; on iOS it uses the
 * "location" background mode (blue pill in the status bar). While GhanaDash is on screen the
 * normal 5 s heartbeat does the work and this task stays quiet.
 */
export const BG_LOCATION_TASK = 'ghanadash-rider-location';

const ONLINE_KEY = 'dispatch.wantOnline';
const BATTERY_TIP_KEY = 'dispatch.batteryTipShown';
/** Don't post more often than this from the background, however often the GPS fires. */
const MIN_POST_MS = 4000;

/** Expo Go can't run background location (it needs the native config in our own build). */
const inExpoGo = Constants.executionEnvironment === 'storeClient';

let lastPost = 0;

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
  BG_LOCATION_TASK,
  async ({ data, error }) => {
    if (error || AppState.currentState === 'active') return;
    const fix = data?.locations?.[data.locations.length - 1];
    if (!fix) return;
    const now = Date.now();
    if (now - lastPost < MIN_POST_MS) return;
    lastPost = now;
    const position = {
      lat: fix.coords.latitude,
      lng: fix.coords.longitude,
      heading: fix.coords.heading != null && fix.coords.heading >= 0 ? fix.coords.heading : null,
      accuracy: fix.coords.accuracy ?? null,
    };
    try {
      const online = (await AsyncStorage.getItem(ONLINE_KEY)) === '1';
      let s;
      try {
        s = await updatePresence({ online, ...position });
      } catch (err) {
        // Plan ran out or account no longer approved: stop asking for orders, but keep sharing
        // the position if a delivery is still under way.
        if (!(err instanceof ApiError && err.status === 403 && online)) throw err;
        await rememberWantOnline(false);
        s = await updatePresence({ online: false, ...position });
      }
      // Server says we're done (went offline elsewhere, plan expired, delivery finished).
      if (!s.online && !s.job) await stopBackgroundTracking();
    } catch (err) {
      // Signed out or refused: stop for good (the app restarts tracking when it is opened and
      // the rider goes online again). Anything else (no signal): try again on the next fix.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        await stopBackgroundTracking();
      }
    }
  },
);

/** Remembered for the background task, which can't see the app's state. */
export async function rememberWantOnline(online: boolean): Promise<void> {
  await AsyncStorage.setItem(ONLINE_KEY, online ? '1' : '0').catch(() => undefined);
}

/**
 * Asks for "Allow all the time" with an explanation first. Returns false if the rider says no;
 * they can still work with GhanaDash open on screen.
 */
export async function ensureBackgroundPermission(): Promise<boolean> {
  if (inExpoGo) return false;
  const current = await Location.getBackgroundPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const go = await new Promise<boolean>((resolve) =>
    Alert.alert(
      'Keep getting orders with your screen off',
      Platform.OS === 'android'
        ? 'On the next screen choose "Allow all the time". GhanaDash then shares your location only while you are online or on a delivery, so you get orders and customers can follow you even when your phone is locked.'
        : 'Choose "Change to Always Allow" when asked. GhanaDash then shares your location only while you are online or on a delivery, so you get orders and customers can follow you even when your phone is locked.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
    ),
  );
  if (!go) return false;
  const res = await Location.requestBackgroundPermissionsAsync().catch(() => null);
  return Boolean(res?.granted);
}

/**
 * Starts (or retunes) background updates: frequent during a delivery, gentler while waiting.
 * Returns false when it can't run (no "always" permission, Expo Go).
 */
export async function startBackgroundTracking(onJob: boolean): Promise<boolean> {
  if (inExpoGo) return false;
  try {
    const perm = await Location.getBackgroundPermissionsAsync();
    if (!perm.granted) return false;
    if (await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
    }
    await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
      accuracy: onJob ? Location.Accuracy.High : Location.Accuracy.Balanced,
      // 0 m so a rider waiting in one spot still reports in (and stays "online" to dispatch).
      distanceInterval: onJob ? 10 : 0,
      timeInterval: onJob ? 5000 : 15000,
      activityType: Location.ActivityType.OtherNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: onJob ? 'Delivery in progress' : 'You’re online',
        notificationBody: onJob
          ? 'Sharing your location with your customer until the delivery is done.'
          : 'Sharing your location so you get nearby orders. Go offline to stop.',
        notificationColor: '#00C853',
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  if (inExpoGo) return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK);
    }
  } catch {
    // Not running.
  }
}

/**
 * Android only, once: many phones sold in Ghana (Tecno, Infinix, itel, Samsung...) stop
 * background apps to save battery, which would take a rider offline without them knowing.
 */
export async function maybeShowBatteryTip(): Promise<void> {
  if (Platform.OS !== 'android' || inExpoGo) return;
  const shown = await AsyncStorage.getItem(BATTERY_TIP_KEY).catch(() => '1');
  if (shown) return;
  await AsyncStorage.setItem(BATTERY_TIP_KEY, '1').catch(() => undefined);
  Alert.alert(
    'Stop your phone from closing GhanaDash',
    'Some phones close apps in the background to save battery, and you would stop getting orders. In Settings, open Battery and choose "Unrestricted" (or "No restrictions") for GhanaDash Rider.',
    [
      { text: 'Later', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ],
  );
}
