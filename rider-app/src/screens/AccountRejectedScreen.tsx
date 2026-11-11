import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusTelemetryPill } from '../components/StatusTelemetryPill';
import { TactileButton } from '../components/TactileButton';
import { SUPPORT } from '../config/support';
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
      <StatusTelemetryPill statusText="Application not approved" badgeText="GHANA" variant="red" />

      <View style={styles.card}>
        <Ionicons name="close-circle" size={44} color={Colors.dangerRed} />
        <Text style={styles.heading}>Your rider application was not approved</Text>
        <Text style={styles.body}>
          Sorry, <Text style={styles.bold}>{riderName}</Text>. A GhanaDash admin reviewed your
          account and did not approve it for dispatch, so you can't go on duty or receive orders.
        </Text>
        <Text style={styles.body}>
          If you think this is a mistake, contact GhanaDash support on {SUPPORT.phoneDisplay} or{' '}
          {SUPPORT.email}. If the decision is reversed, tap Refresh below.
        </Text>
      </View>

      <View style={styles.actions}>
        <TactileButton
          title={`Call support · ${SUPPORT.phoneDisplay}`}
          variant="primary"
          onPress={() => void Linking.openURL(`tel:${SUPPORT.phoneDial}`)}
        />
        <TactileButton
          title="Email support"
          variant="secondary"
          onPress={() =>
            void Linking.openURL(`mailto:${SUPPORT.email}?subject=GhanaDash%20application%20review`)
          }
        />
        <TactileButton
          title="Refresh status"
          variant="secondary"
          onPress={onRefreshStatus}
          loading={loading}
        />
        <TactileButton title="Sign out" variant="danger" onPress={onSignOut} />
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
