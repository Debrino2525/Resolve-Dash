import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusTelemetryPill } from '../components/StatusTelemetryPill';
import { TactileButton } from '../components/TactileButton';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';

export interface PendingVerificationScreenProps {
  riderName: string;
  onRefreshStatus: () => Promise<void>;
  loading: boolean;
}

export function PendingVerificationScreen({
  riderName,
  onRefreshStatus,
  loading,
}: PendingVerificationScreenProps): React.JSX.Element {
  const handleCallSupport = (): void => {
    Alert.alert('Takoradi Dispatch Hub', 'Calling Operations Manager: +233 31 200 0000');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Telemetry Status Pill */}
      <StatusTelemetryPill
        statusText="PENDING HUB VERIFICATION"
        badgeText="WESTERN REGION"
        variant="amber"
      />

      {/* Hero Visual Card */}
      <View style={styles.heroCard}>
        <View style={styles.glowBacking} />
        <View style={styles.emblemCircle}>
          <Text style={styles.emblemIcon}>🏍️</Text>
        </View>

        <View style={styles.hubLocationBadge}>
          <Text style={styles.hubLocationText}>📍 Takoradi Central Operations Hub</Text>
        </View>

        <Text style={styles.heroHeading}>Verification in Progress</Text>
        <Text style={styles.heroDescription}>
          Welcome, <Text style={styles.boldText}>{riderName}</Text>. The Takoradi dispatch team
          is verifying your biometric Ghana Card and motorbike roadworthiness before activating your
          dispatch credentials.
        </Text>
      </View>

      {/* Checklist Card */}
      <View style={styles.checklistCard}>
        <View style={styles.checklistHeader}>
          <Text style={styles.checkTitle}>COMPLIANCE VERIFICATION</Text>
          <Text style={styles.checkProgress}>2/3 CHECKED</Text>
        </View>

        {/* Step 1 */}
        <View style={styles.checkItem}>
          <View style={[styles.statusIconCircle, styles.iconDone]}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
          <View style={styles.checkTextCol}>
            <View style={styles.checkNameRow}>
              <Text style={styles.checkName}>Ghana Card ID</Text>
              <Text style={styles.badgeDone}>VERIFIED</Text>
            </View>
            <Text style={styles.checkSub}>National biometric check validated against registry</Text>
          </View>
        </View>

        {/* Step 2 */}
        <View style={styles.checkItem}>
          <View style={[styles.statusIconCircle, styles.iconDone]}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
          <View style={styles.checkTextCol}>
            <View style={styles.checkNameRow}>
              <Text style={styles.checkName}>Motorbike Roadworthiness</Text>
              <Text style={styles.badgeDone}>VERIFIED</Text>
            </View>
            <Text style={styles.checkSub}>DVLA commercial inspection cleared</Text>
          </View>
        </View>

        {/* Step 3 */}
        <View style={styles.checkItem}>
          <View style={[styles.statusIconCircle, styles.iconPending]}>
            <Text style={styles.checkClock}>⏳</Text>
          </View>
          <View style={styles.checkTextCol}>
            <View style={styles.checkNameRow}>
              <Text style={styles.checkName}>Regional Command Clearance</Text>
              <Text style={styles.badgePending}>IN REVIEW</Text>
            </View>
            <Text style={styles.checkSub}>Awaiting final sign-off from Takoradi Dispatch</Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TactileButton
          title="Refresh Verification Status 🔄"
          variant="primary"
          onPress={onRefreshStatus}
          loading={loading}
        />

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleCallSupport}
          style={styles.supportButton}
        >
          <Text style={styles.supportText}>📞 Call Takoradi Dispatch Hotline</Text>
        </TouchableOpacity>
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
  heroCard: {
    backgroundColor: Colors.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.amberBorder,
    padding: Spacing.xl,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  glowBacking: {
    position: 'absolute',
    top: -40,
    width: 200,
    height: 120,
    backgroundColor: Colors.amberAlertGlow,
    borderRadius: 60,
  },
  emblemCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderColor: Colors.amberAlert,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emblemIcon: {
    fontSize: 36,
  },
  hubLocationBadge: {
    backgroundColor: Colors.amberDark,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radii.pill,
    marginBottom: Spacing.md,
  },
  hubLocationText: {
    ...Typography.micro,
    color: Colors.amberLight,
  },
  heroHeading: {
    ...Typography.h2,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  heroDescription: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  boldText: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  checklistCard: {
    backgroundColor: Colors.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  checklistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingBottom: Spacing.sm,
  },
  checkTitle: {
    ...Typography.micro,
    color: Colors.textMuted,
  },
  checkProgress: {
    ...Typography.micro,
    color: Colors.dispatchGreen,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  statusIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  iconDone: {
    backgroundColor: Colors.dispatchGreen,
  },
  iconPending: {
    backgroundColor: Colors.amberDark,
    borderWidth: 1,
    borderColor: Colors.amberAlert,
  },
  checkMark: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  checkClock: {
    fontSize: 12,
  },
  checkTextCol: {
    flex: 1,
  },
  checkNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkName: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  badgeDone: {
    ...Typography.micro,
    fontSize: 9,
    color: Colors.dispatchGreenLight,
  },
  badgePending: {
    ...Typography.micro,
    fontSize: 9,
    color: Colors.amberLight,
  },
  checkSub: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  actionsContainer: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  supportButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  supportText: {
    ...Typography.caption,
    color: Colors.amberLight,
    fontWeight: '600',
  },
});
