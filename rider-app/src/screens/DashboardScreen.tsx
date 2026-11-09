import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ActiveTripHUD, TripStage } from '../components/ActiveTripHUD';
import { DailyEarningsCard, TripHistoryItem } from '../components/DailyEarningsCard';
import { HeaderBar } from '../components/HeaderBar';
import { IncomingOrderData, IncomingOrderSheet } from '../components/IncomingOrderSheet';
import { StatusTelemetryPill } from '../components/StatusTelemetryPill';
import { SubscriptionCard } from '../components/SubscriptionCard';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import { RiderProfile, SubscriptionDetails } from '../types/subscription';

export interface DashboardScreenProps {
  profile: RiderProfile;
  subscription: SubscriptionDetails | null;
  onRenewSubscription: () => Promise<void>;
  onRefreshData: () => Promise<void>;
  onSignOut: () => Promise<void>;
  renewLoading: boolean;
}

const INITIAL_TRIPS: TripHistoryItem[] = [
  {
    id: 'trip-1',
    route: 'Market Circle → Pipe Ano',
    time: '12:45 PM',
    amountGHS: 'GH₵16.00',
  },
  {
    id: 'trip-2',
    route: 'Harbor Gate 2 → Effiakuma',
    time: '01:20 PM',
    amountGHS: 'GH₵22.50',
  },
];

export function DashboardScreen({
  profile,
  subscription,
  onRenewSubscription,
  onRefreshData,
  onSignOut,
  renewLoading,
}: DashboardScreenProps): React.JSX.Element {
  const [isOnline, setIsOnline] = useState(false);
  const [activeOrder, setActiveOrder] = useState<IncomingOrderData | null>(null);
  const [activeTripStage, setActiveTripStage] = useState<TripStage | null>(null);
  const [earnings, setEarnings] = useState(140.0);
  const [tripsCount, setTripsCount] = useState(8);
  const [recentTrips, setRecentTrips] = useState<TripHistoryItem[]>(INITIAL_TRIPS);

  const canGoOnline = subscription ? subscription.canAcceptOrders : false;

  const handleToggleOnline = (): void => {
    if (!canGoOnline && !isOnline) {
      Alert.alert(
        'Subscription Required',
        'Your weekly dispatch subscription is inactive. Please renew to go online.',
      );
      return;
    }
    setIsOnline((prev) => !prev);
  };

  const handleSimulateOrder = (): void => {
    if (!isOnline) {
      Alert.alert('Go Online First', 'You must switch duty to ON DUTY to receive orders.');
      return;
    }
    setActiveOrder({
      orderId: `ord-${Date.now().toString().slice(-4)}`,
      fareGHS: 'GH₵18.50',
      pickupName: 'Kingsway Supermarket, Market Circle',
      pickupDistance: '1.2 km',
      dropoffName: 'Airport Ridge, Residential Block 4',
      dropoffDistance: '3.8 km',
      packageType: 'Fresh Food & Groceries (2 Items)',
    });
  };

  const handleAcceptOrder = (): void => {
    setActiveOrder(null);
    setActiveTripStage('PICKUP');
  };

  const handleDeclineOrder = (): void => {
    setActiveOrder(null);
  };

  const handleAdvanceStage = (): void => {
    setActiveTripStage('IN_TRANSIT');
  };

  const handleCompleteTrip = (): void => {
    setActiveTripStage(null);
    setEarnings((prev) => prev + 18.5);
    setTripsCount((prev) => prev + 1);
    setRecentTrips((prev) => [
      {
        id: `trip-${Date.now()}`,
        route: 'Market Circle → Airport Ridge',
        time: 'Just now',
        amountGHS: 'GH₵18.50',
      },
      ...prev,
    ]);
    Alert.alert('Delivery Completed! 🎉', 'GH₵18.50 credited to your daily shift earnings.');
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Bar */}
        <HeaderBar
          riderName={profile.fullName}
          isOnline={isOnline}
          onToggleOnline={handleToggleOnline}
          canGoOnline={canGoOnline}
          hubName="Takoradi Central Hub"
        />

        {/* Telemetry Pill */}
        <StatusTelemetryPill
          statusText={
            activeTripStage
              ? 'RUN IN PROGRESS: IN_TRANSIT'
              : isOnline
                ? 'STANDBY: LISTENING FOR TAKORADI ORDERS'
                : 'OFFLINE: DUTY SWITCH OFF'
          }
          badgeText={isOnline ? 'GPS ACTIVE' : 'OFFLINE'}
          variant={isOnline ? 'green' : 'amber'}
        />

        {/* Active Trip HUD */}
        {activeTripStage && (
          <ActiveTripHUD
            stage={activeTripStage}
            customerName="Ama Osei"
            customerPhone="+233 24 999 8888"
            destination="Airport Ridge, Block 4"
            roadCue="Turn right onto John Sarbah Rd"
            distanceCue="250m"
            onAdvanceStage={handleAdvanceStage}
            onCompleteTrip={handleCompleteTrip}
          />
        )}

        {/* Weekly Subscription Access Card */}
        {subscription && (
          <SubscriptionCard
            subscription={subscription}
            onRenew={onRenewSubscription}
            loading={renewLoading}
          />
        )}

        {/* Simulation Action Bar (for test runs) */}
        {!activeTripStage && (
          <View style={styles.simCard}>
            <Text style={styles.simTitle}>DISPATCH SIMULATOR</Text>
            <Text style={styles.simDesc}>
              Test the Takoradi order dispatch radar & turn-by-turn workflow.
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSimulateOrder}
              style={[styles.simButton, !isOnline && styles.simButtonDisabled]}
            >
              <Text style={styles.simButtonText}>Simulate Incoming Order 🔔</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Daily Shift Earnings & Recent Runs */}
        <DailyEarningsCard
          totalEarningsGHS={`GH₵${earnings.toFixed(2)}`}
          tripsCount={tripsCount}
          onlineHours={isOnline ? '5.8h' : '5.4h'}
          acceptanceRate="98%"
          recentTrips={recentTrips}
        />

        {/* Account Footer Actions */}
        <View style={styles.footerRow}>
          <TouchableOpacity onPress={onRefreshData} style={styles.footerAction}>
            <Text style={styles.footerActionText}>🔄 Refresh Data</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onSignOut} style={styles.footerAction}>
            <Text style={[styles.footerActionText, styles.signOutText]}>Log Out 🚪</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Incoming Order Modal Sheet */}
      {activeOrder && (
        <IncomingOrderSheet
          order={activeOrder}
          onAccept={handleAcceptOrder}
          onDecline={handleDeclineOrder}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  simCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.md,
    marginVertical: Spacing.sm,
  },
  simTitle: {
    ...Typography.micro,
    color: Colors.amberLight,
    marginBottom: 2,
  },
  simDesc: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  simButton: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  simButtonDisabled: {
    opacity: 0.5,
  },
  simButtonText: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  footerAction: {
    paddingVertical: Spacing.sm,
  },
  footerActionText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  signOutText: {
    color: Colors.dangerRed,
  },
});
