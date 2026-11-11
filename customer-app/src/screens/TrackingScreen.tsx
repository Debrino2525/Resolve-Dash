import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cancelOrder, getOrder, rateOrder } from '../api/backendClient';
import { AuthImage } from '../components/AuthImage';
import { ChatSheet } from '../components/ChatSheet';
import { DeliveryMap } from '../components/DeliveryMap';
import { InlineNotice } from '../components/InlineNotice';
import { TactileButton } from '../components/TactileButton';
import { fetchRouteLine } from '../services/mapbox';
import { Colors, Elevation, Radii, Spacing, TOUCH_TARGET, Typography } from '../theme/theme';
import {
  cedis,
  CustomerOrder,
  DeliveryDraft,
  isActive,
  PACKAGE_LABEL,
  RATING_TAGS,
  STATUS_LABEL,
} from '../types/orders';
import { formatGhanaLocal } from '../utils/phone';

export interface TrackingScreenProps {
  orderId: string;
  /** Order already in hand (just booked / from the list), shown while the first poll runs. */
  initial?: CustomerOrder | null;
  onClose: () => void;
  onRebook: (draft: DeliveryDraft) => void;
  /** Lets the parent refresh its active-order list when status changes. */
  onChanged?: (order: CustomerOrder) => void;
}

const POLL_MS = 4000;

/**
 * Live delivery: finding a rider → rider on the way (live position, call/WhatsApp, PIN) →
 * delivered (rating). Also the detail view for past orders.
 */
export function TrackingScreen({ orderId, initial, onClose, onRebook, onChanged }: TrackingScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<CustomerOrder | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<{ latitude: number; longitude: number }[] | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // Messages already seen; newer ones show as a badge on the Chat button.
  const [seen, setSeen] = useState<number | null>(initial?.messageCount ?? null);
  const lastStatus = useRef(initial?.status);

  const load = useCallback(async (): Promise<void> => {
    try {
      const o = await getOrder(orderId);
      setOrder(o);
      setSeen((v) => v ?? o.messageCount);
      setError(null);
      if (o.status !== lastStatus.current) {
        lastStatus.current = o.status;
        onChanged?.(o);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh the delivery');
    }
  }, [orderId, onChanged]);

  const active = order ? isActive(order.status) : true;
  useEffect(() => {
    void load();
    if (!active) return;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load, active]);

  useEffect(() => {
    if (order) void fetchRouteLine(order.pickup, order.dropoff).then(setRoute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const cancel = (): void => {
    if (!order) return;
    Alert.alert(
      'Cancel this delivery?',
      order.status === 'ASSIGNED' ? 'Your rider is already on the way to the pickup.' : 'We will stop looking for a rider.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel delivery',
          style: 'destructive',
          onPress: () => {
            setCancelling(true);
            cancelOrder(order.id, 'Cancelled by customer')
              .then((o) => {
                setOrder(o);
                onChanged?.(o);
              })
              .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not cancel'))
              .finally(() => setCancelling(false));
          },
        },
      ],
    );
  };

  if (!order) {
    return (
      <View style={styles.center}>
        {error ? <InlineNotice tone="error" text={error} /> : <ActivityIndicator size="large" color={Colors.dispatchGreen} />}
        <TouchableOpacity onPress={onClose} style={styles.linkBtn}>
          <Text style={styles.link}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const riderPos = order.rider?.location ?? null;
  const showRider = (order.status === 'ASSIGNED' || order.status === 'PICKED_UP') && riderPos;

  return (
    <View style={styles.container}>
      <View style={styles.mapArea}>
        <DeliveryMap
          pickup={order.status === 'PICKED_UP' ? null : order.pickup}
          dropoff={order.dropoff}
          rider={showRider ? riderPos : null}
          route={route}
          showsUser={false}
          edgePadding={{ top: insets.top + 70, bottom: 60 }}
        />
        <TouchableOpacity
          style={[styles.back, { top: insets.top + Spacing.sm }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <StatusHeader order={order} />

        {error && <InlineNotice tone="warning" text={`${error} Retrying…`} />}

        {order.status === 'SEARCHING' && <Searching requestedAt={order.requestedAt} />}

        {(order.status === 'ASSIGNED' || order.status === 'PICKED_UP') && order.rider && (
          <>
            <RiderCard
              order={order}
              unread={Math.max(0, order.messageCount - (seen ?? order.messageCount))}
              onChat={() => setChatOpen(true)}
            />
            <PinCard order={order} />
          </>
        )}

        {order.status === 'DELIVERED' && (order.rating ? <Rated order={order} /> : <RateDelivery order={order} onRated={setOrder} />)}

        {(order.status === 'NO_RIDER' || order.status === 'CANCELLED') && (
          <View style={styles.card}>
            <Text style={styles.body}>
              {order.status === 'NO_RIDER'
                ? 'All nearby riders were busy. You have not been charged. Try again in a few minutes.'
                : `This delivery was cancelled${order.cancelledBy === 'RIDER' ? ' by the rider' : ''}. You have not been charged.`}
            </Text>
            <TactileButton
              title="Book again"
              style={styles.mt}
              onPress={() =>
                onRebook({
                  pickup: order.pickup,
                  dropoff: order.dropoff,
                  packageType: order.packageType,
                  fragile: order.fragile,
                  notes: order.notes,
                })
              }
            />
          </View>
        )}

        <Summary order={order} />

        {order.rider && order.status === 'DELIVERED' && order.messageCount > 0 && (
          <TouchableOpacity onPress={() => setChatOpen(true)} style={styles.linkBtn} accessibilityRole="button">
            <Text style={styles.link}>View messages</Text>
          </TouchableOpacity>
        )}

        {(order.status === 'SEARCHING' || order.status === 'ASSIGNED') && (
          <TouchableOpacity onPress={cancel} disabled={cancelling} style={styles.linkBtn} accessibilityRole="button">
            <Text style={styles.danger}>{cancelling ? 'Cancelling…' : 'Cancel delivery'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {order.rider && (
        <ChatSheet
          visible={chatOpen}
          orderId={order.id}
          otherName={order.rider.fullName.split(' ')[0] ?? 'Your rider'}
          onClose={() => setChatOpen(false)}
          onSeen={setSeen}
        />
      )}
    </View>
  );
}

function StatusHeader({ order }: { order: CustomerOrder }): React.JSX.Element {
  const steps = ['ASSIGNED', 'PICKED_UP', 'DELIVERED'] as const;
  const reached = order.status === 'DELIVERED' ? 3 : order.status === 'PICKED_UP' ? 2 : order.status === 'ASSIGNED' ? 1 : 0;
  const ended = order.status === 'CANCELLED' || order.status === 'NO_RIDER';
  return (
    <View>
      <Text style={styles.code}>Order {order.code}</Text>
      <Text style={styles.status}>{STATUS_LABEL[order.status]}</Text>
      {!ended && (
        <View style={styles.progress}>
          {steps.map((s, i) => (
            <View key={s} style={[styles.progressBar, i < reached && styles.progressOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

function Searching({ requestedAt }: { requestedAt: string }): React.JSX.Element {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((now - new Date(requestedAt).getTime()) / 1000));
  return (
    <View style={[styles.card, styles.row]}>
      <ActivityIndicator color={Colors.dispatchGreen} />
      <View style={styles.flex}>
        <Text style={styles.bodyBold}>Asking the nearest riders…</Text>
        <Text style={styles.small}>
          {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')} · usually under 2 minutes. We'll keep trying for 10.
        </Text>
      </View>
    </View>
  );
}

function RiderCard({
  order,
  unread,
  onChat,
}: {
  order: CustomerOrder;
  unread: number;
  onChat: () => void;
}): React.JSX.Element {
  const r = order.rider!;
  const wa = r.phoneNumber.replace(/^\+/, '');
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <MaterialCommunityIcons name="moped" size={24} color={Colors.onBrand} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.bodyBold}>{r.fullName}</Text>
          <Text style={styles.small}>
            {r.rating ? `★ ${r.rating.toFixed(1)} · ` : ''}
            {r.completedTrips} deliveries{r.plate ? ` · ${r.plate}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.round, { backgroundColor: Colors.dispatchGreen }]}
          onPress={() => void Linking.openURL(`tel:${r.phoneNumber}`)}
          accessibilityRole="button"
          accessibilityLabel={`Call ${r.fullName}`}
        >
          <Ionicons name="call" size={20} color={Colors.onBrand} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.round, { backgroundColor: '#25D366' }]}
          onPress={() => void Linking.openURL(`https://wa.me/${wa}`)}
          accessibilityRole="button"
          accessibilityLabel={`WhatsApp ${r.fullName}`}
        >
          <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.chatBtn}
        onPress={onChat}
        accessibilityRole="button"
        accessibilityLabel={unread ? `Chat, ${unread} new` : 'Chat with your rider'}
      >
        <Ionicons name="chatbubbles-outline" size={20} color={Colors.dispatchGreenLight} />
        <Text style={[styles.link, styles.flex]}>Chat · send a photo of the package or gate</Text>
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread}</Text>
          </View>
        )}
      </TouchableOpacity>
      {!r.location && <Text style={[styles.small, styles.mt]}>Waiting for the rider's location…</Text>}
    </View>
  );
}

function PinCard({ order }: { order: CustomerOrder }): React.JSX.Element {
  const receiver = order.dropoff.contactName;
  const share = (): void => {
    void Share.share({
      message: `Your GhanaDash delivery ${order.code} is on the way. Give the rider this PIN only when you receive the package: ${order.deliveryPin}. Pay ${cedis(order.farePesewas)} cash on delivery.`,
    });
  };
  return (
    <View style={[styles.card, styles.pinCard]}>
      <Text style={styles.small}>Delivery PIN</Text>
      <Text style={styles.pin} accessibilityLabel={`PIN ${order.deliveryPin.split('').join(' ')}`}>
        {order.deliveryPin}
      </Text>
      <Text style={styles.body}>
        Give this to the rider only when the package arrives. They need it to finish the delivery.
      </Text>
      <TouchableOpacity style={styles.shareBtn} onPress={share} accessibilityRole="button">
        <Ionicons name="share-social-outline" size={18} color={Colors.dispatchGreenLight} />
        <Text style={styles.link}>Send PIN to {receiver}</Text>
      </TouchableOpacity>
    </View>
  );
}

function RateDelivery({ order, onRated }: { order: CustomerOrder; onRated: (o: CustomerOrder) => void }): React.JSX.Element {
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onRated(await rateOrder(order.id, stars, tags, comment.trim() || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your rating');
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="checkmark-circle" size={28} color={Colors.dispatchGreen} />
        <Text style={[styles.bodyBold, styles.flex]}>
          Delivered{order.deliveredAt ? ` at ${new Date(order.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
        </Text>
      </View>
      <Text style={[styles.cardTitle, styles.mt]}>How was {order.rider?.fullName.split(' ')[0] ?? 'your rider'}?</Text>
      <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={`${stars} of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} onPress={() => setStars(n)} style={styles.star} accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}>
            <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={36} color={n <= stars ? Colors.amberAlert : Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
      {stars > 0 && (
        <>
          <View style={styles.tags}>
            {RATING_TAGS.map((t) => {
              const on = tags.includes(t.tag);
              return (
                <TouchableOpacity
                  key={t.tag}
                  style={[styles.tag, on && styles.tagOn]}
                  onPress={() => setTags((v) => (on ? v.filter((x) => x !== t.tag) : [...v, t.tag]))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Text style={[styles.tagText, on && { color: Colors.dispatchGreenLight }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Anything else? (optional)"
            placeholderTextColor={Colors.textMuted}
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            multiline
          />
          {error && <InlineNotice tone="error" text={error} />}
          <TactileButton title="Send rating" onPress={() => void submit()} loading={busy} style={styles.mt} />
        </>
      )}
    </View>
  );
}

function Rated({ order }: { order: CustomerOrder }): React.JSX.Element {
  return (
    <View style={[styles.card, styles.row]}>
      <Ionicons name="heart" size={24} color={Colors.dangerRed} />
      <Text style={[styles.body, styles.flex]}>
        Delivered. You rated this {order.rating} star{order.rating === 1 ? '' : 's'}. Thank you!
      </Text>
    </View>
  );
}

function Summary({ order }: { order: CustomerOrder }): React.JSX.Element {
  return (
    <View style={styles.card}>
      {order.hasPackagePhoto && (
        <AuthImage path={`/orders/${order.id}/package-photo`} style={styles.packagePhoto} />
      )}
      <Stop icon="cube" color={Colors.dispatchGreen} label="Pickup" s={order.pickup} />
      <View style={styles.connector} />
      <Stop icon="flag" color={Colors.textPrimary} label="Drop-off" s={order.dropoff} />
      <View style={styles.divider} />
      <View style={styles.line}>
        <Text style={styles.small}>
          {PACKAGE_LABEL[order.packageType]}
          {order.fragile ? ' · fragile' : ''} · Cash on delivery
        </Text>
        <Text style={styles.bodyBold}>{cedis(order.farePesewas)}</Text>
      </View>
    </View>
  );
}

function Stop({
  icon,
  color,
  label,
  s,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  label: string;
  s: CustomerOrder['pickup'];
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <View style={[styles.stopDot, { backgroundColor: color }]}>
        <Ionicons name={icon} size={12} color="#FFFFFF" />
      </View>
      <View style={styles.flex}>
        <Text style={styles.small}>{label}</Text>
        <Text style={styles.bodyBold}>{s.address}</Text>
        <Text style={styles.small}>
          {s.contactName} · {formatGhanaLocal(s.contactPhone)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md, backgroundColor: Colors.background },
  flex: { flex: 1 },
  mt: { marginTop: Spacing.md },
  mapArea: { height: '42%' },
  back: {
    position: 'absolute',
    left: Spacing.lg,
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...Elevation.floating,
  },
  sheet: {
    flex: 1,
    marginTop: -Spacing.xxl,
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
  },
  sheetContent: { padding: Spacing.xl, gap: Spacing.md },
  code: { ...Typography.caption, color: Colors.textMuted },
  status: { ...Typography.h1, color: Colors.textPrimary },
  progress: { flexDirection: 'row', gap: 6, marginTop: Spacing.md },
  progressBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.cardBorder },
  progressOn: { backgroundColor: Colors.dispatchGreen },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    minHeight: TOUCH_TARGET,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.cardBorder,
    paddingTop: Spacing.sm,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.dangerRed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  packagePhoto: { width: '100%', height: 160, marginBottom: Spacing.md },
  card: { backgroundColor: Colors.card, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg },
  cardTitle: { ...Typography.h3, color: Colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  body: { ...Typography.body, color: Colors.textSecondary },
  bodyBold: { ...Typography.bodyBold, color: Colors.textPrimary },
  small: { ...Typography.caption, color: Colors.textSecondary },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.dispatchGreen, alignItems: 'center', justifyContent: 'center' },
  round: { width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: TOUCH_TARGET / 2, alignItems: 'center', justifyContent: 'center' },
  pinCard: { alignItems: 'center', borderColor: Colors.dispatchGreen, backgroundColor: Colors.dispatchGreenGlow },
  pin: { fontSize: 48, fontWeight: '800', letterSpacing: 14, color: Colors.textPrimary, marginVertical: Spacing.xs },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, minHeight: TOUCH_TARGET },
  link: { ...Typography.bodyBold, color: Colors.dispatchGreenLight },
  linkBtn: { alignSelf: 'center', padding: Spacing.md, minHeight: TOUCH_TARGET },
  danger: { ...Typography.bodyBold, color: Colors.dangerRed },
  stars: { flexDirection: 'row', justifyContent: 'center', marginVertical: Spacing.md },
  star: { padding: Spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  tag: { borderWidth: 1.5, borderColor: Colors.cardBorder, borderRadius: Radii.pill, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  tagOn: { borderColor: Colors.dispatchGreen, backgroundColor: Colors.dispatchGreenGlow },
  tagText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '700' },
  input: {
    backgroundColor: Colors.background,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: Colors.textPrimary,
    padding: Spacing.md,
    minHeight: 64,
    textAlignVertical: 'top',
    ...Typography.body,
  },
  stopDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  connector: { width: 2, height: 14, backgroundColor: Colors.cardBorder, marginLeft: 11, marginVertical: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.cardBorder, marginVertical: Spacing.md },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
