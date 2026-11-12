import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { registerPushToken, unregisterPushToken } from '../api/backendClient';

/**
 * Push notifications for riders: new offers (ringing, even with the screen off), customer
 * calls and messages, and "you've gone quiet" alerts. Needs our own build: Expo Go can't
 * receive remote pushes.
 */
const inExpoGo = Constants.executionEnvironment === 'storeClient';
let registeredToken: string | null = null;

// While GhanaDash is on screen the offer sheet already rings, so don't double up.
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const type = (n.request.content.data as { type?: string } | undefined)?.type;
    const quiet = AppState.currentState === 'active' && (type === 'offer' || type === 'stale');
    return {
      shouldShowBanner: !quiet,
      shouldShowList: !quiet,
      shouldPlaySound: !quiet,
      shouldSetBadge: false,
    };
  },
});

async function createChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { AndroidImportance, AndroidNotificationVisibility } = Notifications;
  await Promise.all([
    Notifications.setNotificationChannelAsync('offers', {
      name: 'New orders',
      description: 'Rings when a delivery is offered to you',
      importance: AndroidImportance.MAX,
      sound: 'new_order.wav',
      vibrationPattern: [0, 500, 400, 500, 1200],
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    }),
    Notifications.setNotificationChannelAsync('calls', {
      name: 'Calls',
      importance: AndroidImportance.MAX,
      sound: 'ring.wav',
      vibrationPattern: [0, 800, 600, 800],
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    }),
    Notifications.setNotificationChannelAsync('chat', {
      name: 'Messages',
      importance: AndroidImportance.HIGH,
    }),
    Notifications.setNotificationChannelAsync('alerts', {
      name: 'Account and delivery alerts',
      importance: AndroidImportance.HIGH,
    }),
  ]);
}

/** After sign-in: ask permission once and tell the server where to reach this phone. */
export async function registerForPush(): Promise<void> {
  if (inExpoGo || !Device.isDevice) return;
  try {
    await createChannels();
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(token, 'rider', Platform.OS === 'ios' ? 'ios' : 'android');
    registeredToken = token;
  } catch {
    // No Firebase/APNs set up yet, or offline: the app works without push.
  }
}

/** Before sign-out, so the next person on this phone doesn't get this rider's offers. */
export async function unregisterFromPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (token) await unregisterPushToken(token).catch(() => undefined);
}
