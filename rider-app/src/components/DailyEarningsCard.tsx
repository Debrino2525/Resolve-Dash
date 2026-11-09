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
  recentTrips: TripHistoryItem[];
}

export function DailyEarningsCard({
  totalEarningsGHS = 'GH₵140.00',
  tripsCount = 8,
  onlineHours = '5.4h',
  acceptanceRate = '98%',
  recentTrips = [],
}: DailyEarningsCardProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      {/* Hero Earnings Banner */}
      <View style={styles.heroEarningsCard}>
        <Text style={styles.earningsLabel}>TODAY'S SHIFT EARNINGS</Text>
        <Text style={styles.earningsHero}>{totalEarningsGHS}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCol}>
            <Text style={styles.statNumber}>{tripsCount}</Text>
            <Text style={styles.statLabel}>Trips Done</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statCol}>
            <Text style={styles.statNumber}>{onlineHours}</Text>
            <Text style={styles.statLabel}>Online Time</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statCol}>
            <Text style={styles.statNumber}>{acceptanceRate}</Text>
            <Text style={styles.statLabel}>Acceptance</Text>
          </View>
        </View>
      </View>

      {/* Recent Trips List */}
      {recentTrips.length > 0 && (
        <View style={styles.tripsSection}>
          <Text style={styles.sectionHeader}>RECENT COMPLETED RUNS</Text>
          {recentTrips.map((trip) => (
            <View key={trip.id} style={styles.tripRow}>
              <View>
                <Text style={styles.tripRoute}>{trip.route}</Text>
                <Text style={styles.tripTime}>{trip.time}</Text>
              </View>
              <Text style={styles.tripAmount}>{trip.amountGHS}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
    marginVertical: Spacing.sm,
  },
  heroEarningsCard: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  earningsLabel: {
    ...Typography.micro,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  earningsHero: {
    ...Typography.statHero,
    color: Colors.dispatchGreen,
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: Colors.cardBorder,
  },
  statNumber: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  statLabel: {
    ...Typography.micro,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  tripsSection: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  sectionHeader: {
    ...Typography.micro,
    color: Colors.textMuted,
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(40, 49, 66, 0.4)',
  },
  tripRoute: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  tripTime: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  tripAmount: {
    ...Typography.bodyBold,
    color: Colors.dispatchGreenLight,
  },
});
