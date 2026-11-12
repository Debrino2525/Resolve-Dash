import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { registerPushToken, unregisterPushToken } from '../api/backendClient';

/**
 * Push notifications for customers: rider accepted, picked up, each drop-off, delivered,
 * no rider found, plus rider calls and messages. Needs our own build: Expo Go can't receive
 * remote pushes.
 */
const inExpoGo = Constants.executionEnvironment === 'storeClient';
let registeredToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function createChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { AndroidImportance, AndroidNotificationVisibility } = Notifications;
  await Promise.all([
    Notifications.setNotificationChannelAsync('delivery', {
      name: 'Delivery updates',
      description: 'Rider accepted, picked up, delivered',
      importance: AndroidImportance.HIGH,
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    }),
    Notifications.setNotificationChannelAsync('calls', {
      name: 'Calls from your rider',
      importance: AndroidImportance.MAX,
      sound: 'ring.wav',
      vibrationPattern: [0, 800, 600, 800],
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
    }),
    Notifications.setNotificationChannelAsync('chat', {
      name: 'Messages from your rider',
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
    await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    registeredToken = token;
  } catch {
    // No Firebase/APNs set up yet, or offline: the app works without push.
  }
}

/** Before sign-out, so the next person on this phone doesn't get these updates. */
export async function unregisterFromPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (token) await unregisterPushToken(token).catch(() => undefined);
}

/**
 * Calls `onOpenOrder` when the customer taps a delivery notification, including the one that
 * launched the app from closed. Only while `enabled` (signed in and ready).
 */
export function useOrderNotificationTaps(enabled: boolean, onOpenOrder: (orderId: string) => void): void {
  const handler = useRef(onOpenOrder);
  handler.current = onOpenOrder;
  useEffect(() => {
    if (!enabled || inExpoGo) return;
    const open = (r: Notifications.NotificationResponse | null): void => {
      const orderId = (r?.notification.request.content.data as { orderId?: unknown } | undefined)?.orderId;
      if (typeof orderId === 'string' && orderId) handler.current(orderId);
    };
    void Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        open(r);
        if (r) void Notifications.clearLastNotificationResponseAsync?.();
      })
      .catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [enabled]);
}
