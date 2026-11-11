import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';

export interface TripHistoryItem {
  id: string;
  time: string;
  route: string;
  amountGHS: string;
}

export interface DailyEarningsCardProps {
  totalEarningsGHS: string;
  tripsCount: number;
  onlineHours: string;
  acceptanceRate: string;
  /** Optional list of recent runs; hidden when not provided. */
  recentTrips?: TripHistoryItem[];
}

/** Today's cash collected from completed deliveries, with headline stats. */
export function DailyEarningsCard({
  totalEarningsGHS = 'GH₵0.00',
  tripsCount = 0,
  onlineHours = '—',
  acceptanceRate = '—',
  recentTrips,
}: DailyEarningsCardProps): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Cash collected today</Text>
      </View>
      <Text style={styles.total} accessibilityLabel={`Total ${totalEarningsGHS}`}>
        {totalEarningsGHS}
      </Text>

      <View style={styles.stats}>
        <Stat icon="bicycle" value={String(tripsCount)} label="Deliveries" />
        <Stat icon="time-outline" value={onlineHours} label="Online" />
        <Stat icon="checkmark-done" value={acceptanceRate} label="Accepted" />
      </View>

      {recentTrips && <Text style={styles.sectionLabel}>Recent runs</Text>}
      {!recentTrips ? null : recentTrips.length === 0 ? (
        <Text style={styles.empty}>No runs yet today.</Text>
      ) : (
        recentTrips.slice(0, 5).map((t, i) => (
          <View key={t.id} style={[styles.trip, i > 0 && styles.tripDivider]}>
            <View style={styles.tripIcon}>
              <Ionicons name="cube-outline" size={16} color={Colors.dispatchGreen} />
            </View>
            <View style={styles.tripText}>
              <Text style={styles.tripRoute} numberOfLines={1}>
                {t.route}
              </Text>
              <Text style={styles.tripTime}>{t.time}</Text>
            </View>
            <Text style={styles.tripAmount}>{t.amountGHS}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
  label: string;
}): React.JSX.Element {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color={Colors.textMuted} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.background,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  label: {
    ...Typography.bodyBold,
    color: Colors.textSecondary,
  },
  total: {
    ...Typography.display,
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  stat: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  sectionLabel: {
    ...Typography.micro,
    color: Colors.textMuted,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  empty: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  trip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  tripDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.cardBorder,
  },
  tripIcon: {
    width: 32,
    height: 32,
    borderRadius: Radii.sm,
    backgroundColor: Colors.dispatchGreenGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripText: {
    flex: 1,
  },
  tripRoute: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  tripTime: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  tripAmount: {
    ...Typography.bodyBold,
    color: Colors.dispatchGreenLight,
  },
});
