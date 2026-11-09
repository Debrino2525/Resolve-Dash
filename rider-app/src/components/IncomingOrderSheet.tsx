import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import { TactileButton } from './TactileButton';

export interface IncomingOrderData {
  orderId: string;
  fareGHS: string;
  pickupName: string;
  pickupDistance: string;
  dropoffName: string;
  dropoffDistance: string;
  packageType: string;
}

export interface IncomingOrderSheetProps {
  order: IncomingOrderData;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingOrderSheet({
  order,
  onAccept,
  onDecline,
}: IncomingOrderSheetProps): React.JSX.Element {
  const [timeLeft, setTimeLeft] = useState(15);

  useEffect(() => {
    if (timeLeft <= 0) {
      onDecline();
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft, onDecline]);

  return (
    <View style={styles.sheetOverlay}>
      <View style={styles.sheetContainer}>
        {/* Timer Bar */}
        <View style={styles.headerBar}>
          <View style={styles.badgeRadar}>
            <View style={styles.radarDot} />
            <Text style={styles.radarText}>INCOMING DISPATCH OFFER</Text>
          </View>
          <View style={styles.timerBadge}>
            <Text style={styles.timerText}>{timeLeft}s</Text>
          </View>
        </View>

        {/* Fare Callout */}
        <View style={styles.fareContainer}>
          <Text style={styles.fareLabel}>ESTIMATED EARNINGS</Text>
          <Text style={styles.fareAmount}>{order.fareGHS}</Text>
          <Text style={styles.packageBadge}>{order.packageType}</Text>
        </View>

        {/* Route Details */}
        <View style={styles.routeContainer}>
          {/* Pickup */}
          <View style={styles.routeItem}>
            <View style={[styles.nodeIndicator, styles.pickupNode]} />
            <View style={styles.routeTextContainer}>
              <Text style={styles.routeNodeLabel}>PICKUP ({order.pickupDistance})</Text>
              <Text style={styles.routeName}>{order.pickupName}</Text>
            </View>
          </View>

          {/* Dotted Line */}
          <View style={styles.routeLine} />

          {/* Dropoff */}
          <View style={styles.routeItem}>
            <View style={[styles.nodeIndicator, styles.dropoffNode]} />
            <View style={styles.routeTextContainer}>
              <Text style={styles.routeNodeLabel}>DROPOFF ({order.dropoffDistance})</Text>
              <Text style={styles.routeName}>{order.dropoffName}</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          <TactileButton
            title="Decline"
            variant="secondary"
            onPress={onDecline}
            style={styles.declineButton}
            textStyle={styles.declineText}
          />
          <TactileButton
            title="Accept Order ⚡"
            variant="primary"
            onPress={onAccept}
            style={styles.acceptButton}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  sheetContainer: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.dispatchGreen,
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeRadar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  radarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dispatchGreen,
  },
  radarText: {
    ...Typography.micro,
    color: Colors.dispatchGreen,
  },
  timerBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 109, 0, 0.2)',
    borderWidth: 1.5,
    borderColor: Colors.amberAlert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    ...Typography.bodyBold,
    color: Colors.amberAlert,
  },
  fareContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  fareLabel: {
    ...Typography.micro,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  fareAmount: {
    ...Typography.statHero,
    color: Colors.dispatchGreen,
  },
  packageBadge: {
    ...Typography.micro,
    color: Colors.textSecondary,
    backgroundColor: Colors.cardHover,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radii.pill,
    marginTop: Spacing.xs,
  },
  routeContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: Radii.lg,
    padding: Spacing.lg,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  nodeIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  pickupNode: {
    backgroundColor: Colors.dispatchGreen,
  },
  dropoffNode: {
    backgroundColor: Colors.amberAlert,
  },
  routeLine: {
    width: 2,
    height: 24,
    backgroundColor: Colors.cardBorder,
    marginLeft: 5,
    marginVertical: 4,
  },
  routeTextContainer: {
    flex: 1,
  },
  routeNodeLabel: {
    ...Typography.micro,
    color: Colors.textMuted,
  },
  routeName: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  declineButton: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
  },
  declineText: {
    color: Colors.textMuted,
  },
  acceptButton: {
    flex: 2,
  },
});
