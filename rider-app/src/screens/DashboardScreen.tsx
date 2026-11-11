import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountSheet } from '../components/AccountSheet';
import { DailyEarningsCard } from '../components/DailyEarningsCard';
import { DispatchMap } from '../components/DispatchMap';
import { IncomingOrderSheet } from '../components/IncomingOrderSheet';
import { MapBottomSheet } from '../components/MapBottomSheet';
import { NavigationOverlay } from '../components/NavigationOverlay';
import { PinEntrySheet } from '../components/PinEntrySheet';
import { initialsOf } from '../components/ScreenTopBar';
import { SubscriptionCard } from '../components/SubscriptionCard';
import { useDispatch } from '../services/dispatch';
import { useOfferAlert } from '../services/offerAlert';
import { getCurrentCoords, LatLng, useRiderLocation } from '../services/location';
import { useTurnByTurn } from '../services/navigation';
import { fetchRoadRoute, formatDuration, RoadRoute } from '../services/routing';
import { Colors, Elevation, Radii, Spacing, TOUCH_TARGET, Typography } from '../theme/theme';
import { cedis, OrderStop, PACKAGE_LABEL } from '../types/dispatch';
import { RiderProfile, SubscriptionDetails } from '../types/subscription';
import { distanceMeters, formatDistance, navigationUrl } from '../utils/geo';
import { formatGhanaLocal } from '../utils/phone';

export interface DashboardScreenProps {
  profile: RiderProfile;
  subscription: SubscriptionDetails | null;
  onRenewSubscription: () => Promise<void>;
  onRefreshData: () => Promise<void>;
  onSignOut: () => Promise<void>;
  renewLoading: boolean;
  email: string | null;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const toLatLng = (p: { lat: number; lng: number }): LatLng => ({ latitude: p.lat, longitude: p.lng });

/**
 * Map-first home for approved riders with live dispatch: go online, receive and accept real
 * orders, navigate to pickup and drop-off, and complete delivery with the customer's PIN.
 */
export function DashboardScreen({
  profile,
  subscription,
  onRenewSubscription,
  onRefreshData,
  onSignOut,
  renewLoading,
  email,
}: DashboardScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [sheetHeight, setSheetHeight] = useState(240);
  const [navigating, setNavigating] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [goingOnline, setGoingOnline] = useState(false);

  // Location tracking follows the server's view: on duty, or finishing a job.
  const [tracking, setTracking] = useState(false);
  const location = useRiderLocation(tracking, navigating);
  const here = location.coords;
  const dispatch = useDispatch(here);
  const job = dispatch.state?.job ?? null;
  const offer = dispatch.state?.offer ?? null;
  const online = dispatch.online;
  const showingOffer = Boolean(offer && !job);
  // Ring + vibrate until the rider answers or the offer lapses.
  useOfferAlert(showingOffer && offer ? offer.id : null);

  useEffect(() => {
    setTracking(online || Boolean(job));
  }, [online, job]);

  const stage = job?.status === 'PICKED_UP' ? 'TO_DROPOFF' : 'TO_PICKUP';
  const canGoOnline = subscription?.canAcceptOrders ?? false;

  // Tell the rider when a job disappears without them finishing it (customer cancelled).
  const lastJob = useRef<{ id: string; delivered: boolean } | null>(null);
  useEffect(() => {
    const prev = lastJob.current;
    if (prev && !job && !prev.delivered) {
      setNavigating(false);
      Alert.alert('Delivery cancelled', 'The customer cancelled this delivery. You are back online for new orders.');
    }
    if (!job) setNavigating(false);
    lastJob.current = job ? { id: job.id, delivered: false } : null;
  }, [job?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Road route for the offer or job (rider → pickup → drop-off, or → drop-off once picked up).
  const routeKey = job ? `${job.id}:${job.status}` : offer ? `offer:${offer.id}` : null;
  useEffect(() => {
    if (!routeKey) {
      setRoute(null);
      return;
    }
    const origin = here ?? (job ? toLatLng(job.pickup) : offer ? toLatLng(offer.pickup) : null);
    if (!origin) return;
    const stops = job
      ? stage === 'TO_DROPOFF'
        ? [toLatLng(job.dropoff)]
        : [toLatLng(job.pickup), toLatLng(job.dropoff)]
      : offer
        ? [toLatLng(offer.pickup), toLatLng(offer.dropoff)]
        : [];
    let cancelled = false;
    void fetchRoadRoute([origin, ...stops]).then((r) => {
      if (!cancelled) setRoute(r);
    });
    return () => {
      cancelled = true;
    };
  }, [routeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const collapseSheet = useCallback(() => setSheetExpanded(false), []);

  const goOnline = async (): Promise<void> => {
    if (!canGoOnline) {
      setDetailsOpen(true);
      setSheetExpanded(true);
      return;
    }
    const granted = location.permission === 'granted' || (await location.requestPermission());
    if (!granted) {
      Alert.alert(
        'Location needed to go online',
        'GhanaDash uses your position while you are on duty to offer you nearby orders, guide you, and show customers where their delivery is. Allow location "While using the app" in Settings.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    setGoingOnline(true);
    const fix = here ?? (await getCurrentCoords());
    if (!fix) {
      setGoingOnline(false);
      Alert.alert('No GPS signal yet', 'Move to an open area and try again.');
      return;
    }
    await dispatch.goOnline(fix);
    setGoingOnline(false);
  };

  const goOffline = (): void => {
    if (job) {
      Alert.alert('Finish your delivery first', 'You can go offline once this delivery is complete.');
      return;
    }
    void dispatch.goOffline();
  };

  const navigateTo = (target: LatLng): void => {
    void Linking.openURL(navigationUrl(target, here)).catch(() =>
      Alert.alert('Could not open maps', 'Install Google Maps or try again.'),
    );
  };

  const call = (phone: string): void => {
    void Linking.openURL(`tel:${phone}`);
  };

  const confirmPickup = (): void => {
    if (!job) return;
    Alert.alert('Picked up the package?', `Confirm you have ${job.pickup.contactName}'s package.`, [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Yes, picked up', onPress: () => void dispatch.pickedUp(job.id) },
    ]);
  };

  const confirmDelivered = async (pin: string): Promise<void> => {
    if (!job) return;
    if (lastJob.current) lastJob.current.delivered = true;
    try {
      await dispatch.delivered(job.id, pin);
    } catch (err) {
      if (lastJob.current) lastJob.current.delivered = false;
      throw err;
    }
    setPinOpen(false);
    setNavigating(false);
    Alert.alert('Delivered', `Well done! ${cedis(job.farePesewas)} cash collected.`);
  };

  const releaseJob = (): void => {
    if (!job) return;
    Alert.alert(
      "Can't do this delivery?",
      'It will be offered to another rider. Releasing jobs often may affect your account.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Release',
          style: 'destructive',
          onPress: () => {
            if (lastJob.current) lastJob.current.delivered = true; // no "cancelled" alert
            void dispatch.release(job.id);
          },
        },
      ],
    );
  };

  const target = job ? toLatLng(stage === 'TO_PICKUP' ? job.pickup : job.dropoff) : null;
  const nav = useTurnByTurn(navigating ? target : null, here, navigating, muted);

  const startNavigation = (): void => {
    if (!here) {
      Alert.alert('Waiting for GPS', 'We need your location to start navigation. Try again in a moment, or use Google Maps.');
      return;
    }
    setNavigating(true);
  };

  const onArrivalAction = (): void => {
    if (stage === 'TO_PICKUP') confirmPickup();
    else setPinOpen(true);
  };

  const leg = route?.legs[0];
  const targetInfo = leg
    ? `${formatDistance(leg.distanceMeters)} · ${formatDuration(leg.durationSeconds)}`
    : target && here
      ? formatDistance(distanceMeters(here, target))
      : null;
  const statusLabel = job ? 'On a delivery' : online ? 'Online' : 'Offline';
  const statusColor = job ? Colors.harborBlue : online ? Colors.dispatchGreen : Colors.textMuted;
  const today = dispatch.state?.today ?? { completed: 0, cashPesewas: 0 };

  // ----- Sheet content per state -----
  let header: React.ReactNode;
  let body: React.ReactNode;
  if (job) {
    const stop: OrderStop = stage === 'TO_PICKUP' ? job.pickup : job.dropoff;
    header = (
      <View>
        <Text style={styles.kicker}>{stage === 'TO_PICKUP' ? 'Head to pickup' : 'Deliver to drop-off'}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {stop.address}
        </Text>
        {targetInfo && (
          <View style={styles.metaRow}>
            <Ionicons name="navigate" size={14} color={Colors.roadRoute} />
            <Text style={styles.meta}>{targetInfo}</Text>
          </View>
        )}
        <View style={styles.row}>
          <ActionButton label="Navigate" icon="navigate" tone="blue" onPress={startNavigation} flex />
          <TouchableOpacity
            style={styles.iconAction}
            onPress={() => target && navigateTo(target)}
            accessibilityRole="button"
            accessibilityLabel="Open in Google Maps"
          >
            <MaterialCommunityIcons name="google-maps" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <ActionButton
            label={stage === 'TO_PICKUP' ? 'Picked up' : 'Delivered'}
            icon="checkmark-circle"
            onPress={stage === 'TO_PICKUP' ? confirmPickup : () => setPinOpen(true)}
            flex
          />
        </View>
      </View>
    );
    body = (
      <View style={styles.jobBody}>
        <View style={styles.contactRow}>
          <View style={styles.contactText}>
            <Text style={styles.contactLabel}>{stage === 'TO_PICKUP' ? 'Pickup contact' : 'Receiver'}</Text>
            <Text style={styles.contactName}>{stop.contactName}</Text>
            <Text style={styles.contactPhone}>{formatGhanaLocal(stop.contactPhone)}</Text>
          </View>
          <TouchableOpacity
            style={styles.callBtn}
            onPress={() => call(stop.contactPhone)}
            accessibilityRole="button"
            accessibilityLabel={`Call ${stop.contactName}`}
          >
            <Ionicons name="call" size={20} color={Colors.onBrand} />
          </TouchableOpacity>
        </View>
        {(stop.landmark || stop.gpsCode) && (
          <View style={styles.landmark}>
            <Ionicons name="location" size={16} color={Colors.amberLight} />
            <Text style={styles.landmarkText}>
              {[stop.landmark, stop.gpsCode].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}
        <View style={styles.chipRow}>
          <Text style={styles.chip}>{PACKAGE_LABEL[job.packageType]}</Text>
          {job.fragile && <Text style={[styles.chip, styles.chipWarn]}>Fragile</Text>}
          <Text style={[styles.chip, styles.chipCash]}>Collect {cedis(job.farePesewas)} cash</Text>
        </View>
        {job.notes ? <Text style={styles.notes}>“{job.notes}”</Text> : null}
        <Text style={styles.small}>
          Order {job.code} · for {job.customerName}
        </Text>
        {stage === 'TO_PICKUP' && (
          <TouchableOpacity onPress={releaseJob} style={styles.linkBtn} accessibilityRole="button">
            <Text style={styles.linkDanger}>Can't do this delivery</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  } else if (online) {
    header = (
      <View>
        <Text style={styles.kicker}>You're online</Text>
        <Text style={styles.title}>Waiting for orders</Text>
        <ActionButton label="Go offline" icon="power" tone="neutral" onPress={goOffline} />
      </View>
    );
    body = (
      <Text style={styles.subtitle}>
        New requests appear here automatically, nearest rider first. Keep the app open and stay
        near busy areas.
      </Text>
    );
  } else {
    header = (
      <View>
        <Text style={[styles.kicker, !canGoOnline && { color: Colors.amberLight }]}>
          {canGoOnline ? 'Ready when you are' : 'Dispatch access inactive'}
        </Text>
        <Text style={styles.title}>You're offline</Text>
        <ActionButton
          label={goingOnline ? 'Going online…' : canGoOnline ? 'Go online' : 'Renew plan'}
          icon={canGoOnline ? 'power' : 'card'}
          tone={canGoOnline ? 'green' : 'amber'}
          onPress={() => void goOnline()}
          large
        />
      </View>
    );
    body = (
      <Text style={styles.subtitle}>
        {canGoOnline
          ? `Hi ${profile.fullName.split(' ')[0]}. Go online to receive delivery requests near you.`
          : 'Your weekly plan has ended. Renew to go online again.'}
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      <DispatchMap
        rider={here}
        pickup={job ? toLatLng(job.pickup) : offer ? toLatLng(offer.pickup) : null}
        dropoff={job ? toLatLng(job.dropoff) : offer ? toLatLng(offer.dropoff) : null}
        route={navigating ? (nav.route?.coordinates ?? route?.coordinates) : route?.coordinates}
        follow={online && !job && !offer}
        bottomInset={navigating ? 220 : sheetHeight}
        topInset={insets.top + (navigating ? 150 : 64)}
        onMapTouch={navigating ? undefined : collapseSheet}
        navigationCamera={navigating && here ? { center: here, heading: nav.progress?.bearing ?? 0 } : null}
      />

      {navigating && job && (
        <NavigationOverlay
          nav={nav}
          destinationLabel={stage === 'TO_PICKUP' ? job.pickup.address : job.dropoff.address}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onExit={() => setNavigating(false)}
          onOpenGoogleMaps={() => target && navigateTo(target)}
          arrivalActionLabel={stage === 'TO_PICKUP' ? 'Picked up' : 'Enter delivery PIN'}
          onArrivalAction={onArrivalAction}
        />
      )}

      {!navigating && !showingOffer && (
        <>
          {/* Floating top bar */}
          <View style={[styles.topBar, { top: insets.top + Spacing.sm }]} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.avatar}
              onPress={() => setAccountOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Account, support and sign out"
            >
              <Text style={styles.avatarText}>{initialsOf(profile.fullName)}</Text>
            </TouchableOpacity>

            <View style={styles.statusChip} accessibilityLabel={`Status: ${statusLabel}`}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>

            <TouchableOpacity
              style={styles.earningsChip}
              onPress={() => {
                setDetailsOpen(true);
                setSheetExpanded(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Cash collected today ${cedis(today.cashPesewas)}`}
            >
              <Ionicons name="wallet-outline" size={16} color={Colors.dispatchGreenLight} />
              <Text style={styles.earningsText}>₵{(today.cashPesewas / 100).toFixed(2)}</Text>
            </TouchableOpacity>
          </View>

          {(dispatch.error || (location.error && online)) && (
            <TouchableOpacity
              style={[styles.banner, { top: insets.top + 68 }]}
              onPress={dispatch.clearError}
              accessibilityRole="alert"
            >
              <Ionicons name="warning" size={16} color={Colors.amberLight} />
              <Text style={styles.bannerText}>{dispatch.error ?? location.error}</Text>
              {dispatch.error && <Ionicons name="close" size={16} color={Colors.amberLight} />}
            </TouchableOpacity>
          )}

          <MapBottomSheet
            header={header}
            expanded={sheetExpanded}
            onExpandedChange={setSheetExpanded}
            onVisibleHeightChange={setSheetHeight}
          >
            {body}

            <TouchableOpacity
              style={styles.detailsToggle}
              onPress={() => setDetailsOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
            >
              <View style={styles.detailsLabel}>
                <Ionicons name="stats-chart" size={16} color={Colors.textSecondary} />
                <Text style={styles.detailsToggleText}>Plan & earnings</Text>
              </View>
              <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            {detailsOpen && (
              <ScrollView style={styles.details} contentContainerStyle={styles.detailsContent} nestedScrollEnabled>
                {subscription && (
                  <SubscriptionCard subscription={subscription} onRenew={onRenewSubscription} loading={renewLoading} />
                )}
                <DailyEarningsCard
                  totalEarningsGHS={cedis(today.cashPesewas)}
                  tripsCount={today.completed}
                  onlineHours="—"
                  acceptanceRate="—"
                />
                <TouchableOpacity
                  onPress={() => {
                    void onRefreshData();
                    void dispatch.refresh();
                  }}
                  style={styles.refresh}
                  accessibilityRole="button"
                >
                  <Ionicons name="refresh" size={14} color={Colors.textMuted} />
                  <Text style={styles.refreshText}>Refresh account status</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </MapBottomSheet>
        </>
      )}

      {offer && !job && (
        <IncomingOrderSheet
          offer={offer}
          busy={dispatch.busy}
          onAccept={() => void dispatch.accept(offer.id)}
          onDecline={() => void dispatch.decline(offer.id)}
        />
      )}

      <PinEntrySheet
        visible={pinOpen && Boolean(job)}
        receiverName={job?.dropoff.contactName ?? 'the receiver'}
        farePesewas={job?.farePesewas ?? 0}
        onSubmit={confirmDelivered}
        onClose={() => setPinOpen(false)}
      />

      <AccountSheet
        visible={accountOpen}
        onClose={() => setAccountOpen(false)}
        riderName={profile.fullName}
        email={email}
        phoneNumber={profile.phoneNumber}
        onSignOut={onSignOut}
      />
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  tone = 'green',
  large = false,
  flex = false,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  tone?: 'green' | 'blue' | 'amber' | 'neutral';
  large?: boolean;
  flex?: boolean;
}): React.JSX.Element {
  const palette = {
    green: { bg: Colors.dispatchGreen, fg: Colors.onBrand, border: Colors.dispatchGreen },
    blue: { bg: Colors.harborBlue, fg: '#FFFFFF', border: Colors.harborBlue },
    amber: { bg: Colors.amberAlert, fg: Colors.onBrand, border: Colors.amberAlert },
    neutral: { bg: Colors.surfaceLight, fg: Colors.textPrimary, border: Colors.cardBorder },
  }[tone];
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.action,
        { backgroundColor: palette.bg, borderColor: palette.border },
        large && styles.actionLarge,
        flex && styles.flex,
      ]}
      accessibilityRole="button"
      activeOpacity={0.85}
    >
      <Ionicons name={icon} size={large ? 22 : 18} color={palette.fg} />
      <Text style={[styles.actionText, { color: palette.fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatar: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: Radii.pill,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.dispatchGreen,
    alignItems: 'center',
    justifyContent: 'center',
    ...Elevation.floating,
  },
  avatarText: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 40,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    ...Elevation.floating,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  earningsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: TOUCH_TARGET,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    ...Elevation.floating,
  },
  earningsText: {
    ...Typography.bodyBold,
    color: Colors.dispatchGreenLight,
  },
  banner: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.amberDark,
    borderColor: Colors.amberBorder,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  bannerText: {
    ...Typography.caption,
    color: Colors.amberLight,
    flex: 1,
  },
  kicker: {
    ...Typography.micro,
    color: Colors.dispatchGreen,
  },
  title: {
    ...Typography.h2,
    color: Colors.textPrimary,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
  },
  meta: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  flex: {
    flex: 1,
  },
  action: {
    flexDirection: 'row',
    gap: Spacing.sm,
    minHeight: 52,
    borderRadius: Radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  iconAction: {
    width: 52,
    height: 52,
    borderRadius: Radii.lg,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLarge: {
    minHeight: 58,
  },
  actionText: {
    ...Typography.h3,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TOUCH_TARGET,
    marginTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.cardBorder,
  },
  detailsLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  detailsToggleText: {
    ...Typography.bodyBold,
    color: Colors.textSecondary,
  },
  details: {
    maxHeight: 380,
  },
  detailsContent: {
    gap: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  refresh: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    alignSelf: 'center',
    padding: Spacing.md,
  },
  refreshText: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  jobBody: {
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: Radii.lg,
    padding: Spacing.md,
  },
  contactText: { flex: 1 },
  contactLabel: { ...Typography.caption, color: Colors.textMuted },
  contactName: { ...Typography.bodyBold, color: Colors.textPrimary },
  contactPhone: { ...Typography.caption, color: Colors.textSecondary },
  callBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: Radii.pill,
    backgroundColor: Colors.dispatchGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  landmark: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  landmarkText: { ...Typography.body, color: Colors.amberLight, flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    ...Typography.micro,
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  chipWarn: { color: Colors.amberLight, backgroundColor: Colors.amberDark },
  chipCash: { color: Colors.dispatchGreenLight, backgroundColor: Colors.dispatchGreenGlow },
  notes: { ...Typography.body, color: Colors.textSecondary, fontStyle: 'italic' },
  small: { ...Typography.caption, color: Colors.textMuted },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: Spacing.sm },
  linkDanger: { ...Typography.bodyBold, color: Colors.dangerRed },
});
