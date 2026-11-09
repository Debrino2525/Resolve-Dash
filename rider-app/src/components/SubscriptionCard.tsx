import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import { formatPesewasToGHS } from '../types/money';
import { SubscriptionDetails } from '../types/subscription';
import { TactileButton } from './TactileButton';

export interface SubscriptionCardProps {
  subscription: SubscriptionDetails;
  onRenew: () => void;
  loading?: boolean;
}

function computeRemainingHours(targetIso: string | null, serverTimeIso: string): number {
  if (!targetIso) return 0;
  const targetMs = new Date(targetIso).getTime();
  const serverMs = new Date(serverTimeIso).getTime();
  const diffHours = (targetMs - serverMs) / (1000 * 60 * 60);
  return Math.max(0, Math.floor(diffHours));
}

export function SubscriptionCard({
  subscription,
  onRenew,
  loading = false,
}: SubscriptionCardProps): React.JSX.Element {
  const isGrace = subscription.status === 'GRACE_PERIOD';
  const isSuspended = !subscription.canAcceptOrders || subscription.status === 'SUSPENDED';
  const remainingHours = computeRemainingHours(
    isGrace ? subscription.graceEndsAt : subscription.paidUntil,
    subscription.serverTime,
  );

  return (
    <View
      style={[
        styles.card,
        isSuspended && styles.cardSuspended,
        isGrace && styles.cardGrace,
      ]}
    >
      {/* Top Banner for Alert States */}
      {isGrace && (
        <View style={styles.alertBanner}>
          <Text style={styles.alertText}>
            ⚠️ GRACE PERIOD ACTIVE: {remainingHours}h remaining to renew before dispatch lock!
          </Text>
        </View>
      )}

      {isSuspended && (
        <View style={styles.dangerBanner}>
          <Text style={styles.dangerText}>
            🔒 DISPATCH ACCESS LOCKED — Weekly prepaid subscription renewal required
          </Text>
        </View>
      )}

      <View style={styles.mainContent}>
        <View style={styles.infoRow}>
          <View>
            <Text style={styles.label}>DISPATCH ACCESS STATUS</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusIndicator,
                  {
                    backgroundColor: isSuspended
                      ? Colors.dangerRed
                      : isGrace
                        ? Colors.amberAlert
                        : Colors.dispatchGreen,
                  },
                ]}
              />
              <Text style={styles.statusValue}>{subscription.status}</Text>
            </View>
          </View>

          <View style={styles.rateBox}>
            <Text style={styles.label}>RATE</Text>
            <Text style={styles.rateValue}>
              {formatPesewasToGHS(subscription.pricePesewas)}
              <Text style={styles.perWeek}> / 7d</Text>
            </Text>
          </View>
        </View>

        {subscription.paidUntil && !isSuspended && (
          <View style={styles.accessCountdownBox}>
            <Text style={styles.countdownLabel}>AUTHORITATIVE REMAINING TIME:</Text>
            <Text style={styles.countdownValue}>
              {Math.floor(remainingHours / 24)} days, {remainingHours % 24} hours
            </Text>
          </View>
        )}

        {(isSuspended || isGrace || remainingHours < 24) && (
          <View style={styles.actionContainer}>
            <Text style={styles.paymentMethodsNotice}>
              Instant activation via Paystack (MTN MoMo, Telecel Cash, Card)
            </Text>
            <TactileButton
              title="Renew 7-Day Access (GH₵50.00)"
              variant={isSuspended ? 'danger' : 'amber'}
              onPress={onRenew}
              loading={loading}
              style={styles.renewButton}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    marginVertical: Spacing.sm,
  },
  cardGrace: {
    borderColor: Colors.amberAlert,
  },
  cardSuspended: {
    borderColor: Colors.dangerRed,
  },
  alertBanner: {
    backgroundColor: Colors.amberDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.amberBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  alertText: {
    ...Typography.micro,
    color: Colors.amberLight,
    textAlign: 'center',
  },
  dangerBanner: {
    backgroundColor: Colors.dangerDark,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dangerBorder,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dangerText: {
    ...Typography.micro,
    color: Colors.dangerRed,
    textAlign: 'center',
  },
  mainContent: {
    padding: Spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  label: {
    ...Typography.micro,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusValue: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  rateBox: {
    alignItems: 'flex-end',
  },
  rateValue: {
    ...Typography.h2,
    color: Colors.dispatchGreenLight,
  },
  perWeek: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  accessCountdownBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  countdownLabel: {
    ...Typography.micro,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  countdownValue: {
    ...Typography.bodyBold,
    color: Colors.dispatchGreenLight,
  },
  actionContainer: {
    marginTop: Spacing.lg,
  },
  paymentMethodsNotice: {
    ...Typography.micro,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  renewButton: {
    width: '100%',
  },
});
