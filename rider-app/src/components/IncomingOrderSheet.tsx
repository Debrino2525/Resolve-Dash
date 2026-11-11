import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDuration } from '../services/routing';
import { AuthImage } from './AuthImage';
import { Colors, Elevation, Radii, Spacing, Typography } from '../theme/theme';
import { cedis, PACKAGE_LABEL, RiderOffer } from '../types/dispatch';
import { formatDistance } from '../utils/geo';

export interface IncomingOrderSheetProps {
  offer: RiderOffer;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
}

/**
 * Live order offer, shown in a Modal so it is always the top layer (on Android, elevation of the
 * map sheet could otherwise draw over it while still letting taps through to hidden buttons).
 * Counts down to the server's expiry; if the rider does nothing, the offer simply lapses and is
 * NOT accepted.
 */
export function IncomingOrderSheet({
  offer,
  onAccept,
  onDecline,
  busy,
}: IncomingOrderSheetProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const secondsLeft = (): number =>
    Math.max(0, Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / 1000));
  const [left, setLeft] = useState(secondsLeft);

  useEffect(() => {
    setLeft(secondsLeft());
    const t = setInterval(() => setLeft(secondsLeft()), 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.id]);

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.headerRow}>
            <View style={styles.live}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>New delivery request</Text>
            </View>
            <View style={[styles.timer, left <= 5 && styles.timerUrgent]}>
              <Text style={[styles.timerText, left <= 5 && { color: Colors.dangerRed }]}>
                {left}s
              </Text>
            </View>
          </View>

          <View style={styles.fareRow}>
            <View>
              <Text style={styles.fare}>{cedis(offer.farePesewas)}</Text>
              <Text style={styles.fareSub}>Collect in cash at drop-off</Text>
            </View>
            <View style={styles.chips}>
              <Text style={styles.chip}>{PACKAGE_LABEL[offer.packageType]}</Text>
              {offer.fragile && <Text style={[styles.chip, styles.chipWarn]}>Fragile</Text>}
            </View>
            {offer.hasPackagePhoto && (
              <AuthImage path={`/orders/${offer.orderId}/package-photo`} style={styles.packagePhoto} />
            )}
          </View>

          <View style={styles.route}>
            <Stop
              icon="cube"
              color={Colors.dispatchGreen}
              label={`Pickup · ${formatDistance(offer.distanceToPickupMeters)} from you`}
              address={offer.pickup.address}
              landmark={offer.pickup.landmark}
            />
            <View style={styles.connector} />
            <Stop
              icon="flag"
              color={Colors.harborBlue}
              label={`Drop-off · ${formatDistance(offer.distanceMeters)} trip, ~${formatDuration(offer.durationSeconds)}`}
              address={offer.dropoff.address}
              landmark={offer.dropoff.landmark}
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.decline]}
              onPress={onDecline}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.accept, busy && { opacity: 0.6 }]}
              onPress={onAccept}
              disabled={busy || left === 0}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="moped" size={22} color={Colors.onBrand} />
              <Text style={styles.acceptText}>{busy ? 'Accepting…' : 'Accept'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.lapse}>
            {left > 0 ? 'No answer means no: the order goes to the next rider.' : 'Offer expired'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function Stop({
  icon,
  color,
  label,
  address,
  landmark,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  label: string;
  address: string;
  landmark: string | null;
}): React.JSX.Element {
  return (
    <View style={styles.stop}>
      <View style={[styles.stopIcon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={styles.stopText}>
        <Text style={styles.stopLabel}>{label}</Text>
        <Text style={styles.stopAddress} numberOfLines={2}>
          {address}
        </Text>
        {landmark ? (
          <Text style={styles.stopLandmark} numberOfLines={1}>
            {landmark}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.dispatchGreen,
    padding: Spacing.xl,
    gap: Spacing.lg,
    ...Elevation.sheet,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.dispatchGreen },
  liveText: { ...Typography.bodyBold, color: Colors.dispatchGreen },
  timer: {
    minWidth: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.amberAlert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerUrgent: { borderColor: Colors.dangerRed },
  timerText: { ...Typography.h3, color: Colors.amberAlert },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  fare: { ...Typography.display, color: Colors.textPrimary },
  fareSub: { ...Typography.caption, color: Colors.textSecondary },
  packagePhoto: { width: 72, height: 72, marginLeft: Spacing.md },
  chips: { alignItems: 'flex-end', gap: 6 },
  chip: {
    ...Typography.micro,
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  chipWarn: { color: Colors.amberLight, backgroundColor: Colors.amberDark },
  route: { backgroundColor: Colors.background, borderRadius: Radii.lg, padding: Spacing.lg },
  stop: { flexDirection: 'row', gap: Spacing.md },
  stopIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopText: { flex: 1 },
  stopLabel: { ...Typography.caption, color: Colors.textMuted },
  stopAddress: { ...Typography.bodyBold, color: Colors.textPrimary },
  stopLandmark: { ...Typography.caption, color: Colors.textSecondary },
  connector: {
    width: 2,
    height: 18,
    backgroundColor: Colors.cardBorder,
    marginLeft: 15,
    marginVertical: 4,
  },
  actions: { flexDirection: 'row', gap: Spacing.md },
  btn: {
    minHeight: 56,
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  decline: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  declineText: { ...Typography.bodyBold, color: Colors.textSecondary },
  accept: { flex: 2, backgroundColor: Colors.dispatchGreen },
  acceptText: { ...Typography.h3, color: Colors.onBrand },
  lapse: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center' },
});
