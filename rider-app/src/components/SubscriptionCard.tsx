import { Ionicons } from '@expo/vector-icons';
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

function remainingHours(targetIso: string | null, serverTimeIso: string): number {
  if (!targetIso) return 0;
  const diff = (new Date(targetIso).getTime() - new Date(serverTimeIso).getTime()) / 3_600_000;
  return Math.max(0, Math.floor(diff));
}

function formatRemaining(hours: number): string {
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  if (days === 0) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${days} day${days === 1 ? '' : 's'}${h ? `, ${h} h` : ''}`;
}

const STATUS = {
  TRIAL: { label: 'Free trial', color: Colors.harborBlue, icon: 'gift' },
  ACTIVE: { label: 'Active', color: Colors.dispatchGreen, icon: 'checkmark-circle' },
  GRACE_PERIOD: { label: 'Grace period', color: Colors.amberAlert, icon: 'time' },
  SUSPENDED: { label: 'Inactive', color: Colors.dangerRed, icon: 'lock-closed' },
} as const;

/** Weekly dispatch plan: status, time left (server clock) and renewal. */
export function SubscriptionCard({
  subscription,
  onRenew,
  loading = false,
}: SubscriptionCardProps): React.JSX.Element {
  const isTrial = subscription.status === 'TRIAL';
  const isGrace = subscription.status === 'GRACE_PERIOD';
  const isSuspended = !subscription.canAcceptOrders || subscription.status === 'SUSPENDED';
  const coverageEnd = isTrial
    ? subscription.trialEndsAt
    : isGrace
      ? subscription.graceEndsAt
      : subscription.paidUntil;
  const hours = remainingHours(coverageEnd, subscription.serverTime);
  const price = formatPesewasToGHS(subscription.pricePesewas);
  const status = STATUS[isSuspended ? 'SUSPENDED' : subscription.status];
  const showRenew = isSuspended || isGrace || hours < 24;

  return (
    <View style={[styles.card, isSuspended && styles.cardDanger, isGrace && styles.cardWarn]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Weekly plan</Text>
        <View style={[styles.statusPill, { backgroundColor: `${status.color}22` }]}>
          <Ionicons name={status.icon} size={13} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      {isSuspended ? (
        <Text style={styles.headline}>Renew to go online</Text>
      ) : (
        <>
          <Text style={styles.headline}>{formatRemaining(hours)} left</Text>
          <Text style={styles.caption}>
            {isTrial ? 'Free trial ends' : isGrace ? 'Grace period ends' : 'Paid access ends'}
            {coverageEnd ? ` ${new Date(coverageEnd).toLocaleString()}` : ''}
          </Text>
        </>
      )}

      <View style={styles.priceRow}>
        <Text style={styles.price}>{price}</Text>
        <Text style={styles.per}> / 7 days · prepaid, never auto-renews</Text>
      </View>

      {showRenew && (
        <>
          <TactileButton
            title={`${isTrial ? 'Buy' : 'Renew'} 7 days · ${price}`}
            variant={isSuspended ? 'danger' : 'amber'}
            onPress={onRenew}
            loading={loading}
            style={styles.renew}
          />
          <Text style={styles.methods}>MTN MoMo, Telecel Cash or card via Paystack</Text>
        </>
      )}
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
  cardDanger: {
    borderColor: Colors.dangerBorder,
  },
  cardWarn: {
    borderColor: Colors.amberBorder,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    ...Typography.bodyBold,
    color: Colors.textSecondary,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radii.pill,
  },
  statusText: {
    ...Typography.micro,
  },
  headline: {
    ...Typography.h1,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  caption: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginTop: Spacing.lg,
  },
  price: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  per: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  renew: {
    marginTop: Spacing.lg,
  },
  methods: {
    ...Typography.caption,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
