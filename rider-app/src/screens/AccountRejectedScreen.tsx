import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusTelemetryPill } from '../components/StatusTelemetryPill';
import { TactileButton } from '../components/TactileButton';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';

export interface AccountRejectedScreenProps {
  riderName: string;
  onRefreshStatus: () => Promise<void>;
  onSignOut: () => Promise<void>;
  loading: boolean;
}

/**
 * Shown when an admin has rejected the rider's application.
 * The backend also refuses dispatch eligibility (RIDER_NOT_APPROVED), so this screen is
 * informational: there is deliberately no path to go on duty from here.
 */
export function AccountRejectedScreen({
  riderName,
  onRefreshStatus,
  onSignOut,
  loading,
}: AccountRejectedScreenProps): React.JSX.Element {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusTelemetryPill statusText="APPLICATION NOT APPROVED" badgeText="GHANA" variant="red" />

      <View style={styles.card}>
        <Text style={styles.icon}>⛔</Text>
        <Text style={styles.heading}>Your rider application was not approved</Text>
        <Text style={styles.body}>
          Sorry, <Text style={styles.bold}>{riderName}</Text>. A GhanaDash admin reviewed your
          account and did not approve it for dispatch, so you can't go on duty or receive orders.
        </Text>
        <Text style={styles.body}>
          If you think this is a mistake, contact GhanaDash operations. If an admin reverses the
          decision, tap Refresh below.
        </Text>
      </View>

      <View style={styles.actions}>
        <TactileButton
          title="Refresh Status 🔄"
          variant="secondary"
          onPress={onRefreshStatus}
          loading={loading}
        />
        <TactileButton title="Sign Out" variant="danger" onPress={onSignOut} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.dangerDark,
    borderColor: Colors.dangerBorder,
    borderWidth: 1,
    borderRadius: Radii.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  icon: {
    fontSize: 36,
  },
  heading: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  body: {
    ...Typography.body,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  bold: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  actions: {
    gap: Spacing.md,
  },
});
