import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import { TactileButton } from './TactileButton';

export type TripStage = 'PICKUP' | 'IN_TRANSIT' | 'DELIVERED';

export interface ActiveTripHUDProps {
  stage: TripStage;
  customerName: string;
  customerPhone: string;
  destination: string;
  roadCue: string;
  distanceCue: string;
  onAdvanceStage: () => void;
  onCompleteTrip: () => void;
}

export function ActiveTripHUD({
  stage,
  customerName,
  customerPhone,
  destination,
  roadCue = 'John Sarbah Rd, Takoradi',
  distanceCue = '250m',
  onAdvanceStage,
  onCompleteTrip,
}: ActiveTripHUDProps): React.JSX.Element {
  const handleCallCustomer = (): void => {
    Alert.alert('Calling Customer', `Dialing ${customerPhone}...`);
  };

  return (
    <View style={styles.hudContainer}>
      {/* Turn-by-Turn Cue Banner */}
      <View style={styles.turnBanner}>
        <View style={styles.turnIconCircle}>
          <Text style={styles.turnIcon}>↪️</Text>
        </View>
        <View style={styles.turnTextContainer}>
          <Text style={styles.distanceText}>In {distanceCue}</Text>
          <Text style={styles.roadNameText}>{roadCue}</Text>
        </View>
      </View>

      {/* Trip Progress Stepper */}
      <View style={styles.stepperContainer}>
        <View style={styles.step}>
          <View style={[styles.stepDot, styles.stepCompleted]} />
          <Text style={styles.stepLabel}>Accepted</Text>
        </View>
        <View style={[styles.stepBar, stage !== 'PICKUP' && styles.stepBarActive]} />
        <View style={styles.step}>
          <View
            style={[
              styles.stepDot,
              stage !== 'PICKUP' ? styles.stepCompleted : styles.stepActive,
            ]}
          />
          <Text style={styles.stepLabel}>Picked Up</Text>
        </View>
        <View style={[styles.stepBar, stage === 'DELIVERED' && styles.stepBarActive]} />
        <View style={styles.step}>
          <View
            style={[
              styles.stepDot,
              stage === 'DELIVERED' ? styles.stepCompleted : styles.stepInactive,
            ]}
          />
          <Text style={styles.stepLabel}>Delivered</Text>
        </View>
      </View>

      {/* Customer Tray */}
      <View style={styles.customerCard}>
        <View style={styles.customerInfo}>
          <View style={styles.customerAvatar}>
            <Text style={styles.customerAvatarText}>{customerName[0]}</Text>
          </View>
          <View>
            <Text style={styles.customerName}>{customerName}</Text>
            <Text style={styles.destinationText}>Destination: {destination}</Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleCallCustomer}
          style={styles.callButton}
        >
          <Text style={styles.callIcon}>📞</Text>
          <Text style={styles.callText}>Call</Text>
        </TouchableOpacity>
      </View>

      {/* Primary Action Button */}
      {stage === 'PICKUP' ? (
        <TactileButton
          title="Confirm Package Picked Up 📦"
          variant="primary"
          onPress={onAdvanceStage}
          style={styles.actionButton}
        />
      ) : stage === 'IN_TRANSIT' ? (
        <TactileButton
          title="Slide to Confirm Delivery ✅"
          variant="primary"
          onPress={onCompleteTrip}
          style={styles.actionButton}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hudContainer: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginVertical: Spacing.sm,
  },
  turnBanner: {
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  turnIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 229, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnIcon: {
    fontSize: 18,
  },
  turnTextContainer: {
    flex: 1,
  },
  distanceText: {
    ...Typography.micro,
    color: Colors.roadRoute,
  },
  roadNameText: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
  },
  step: {
    alignItems: 'center',
    gap: 4,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepCompleted: {
    backgroundColor: Colors.dispatchGreen,
  },
  stepActive: {
    backgroundColor: Colors.amberAlert,
  },
  stepInactive: {
    backgroundColor: Colors.textMuted,
  },
  stepBar: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.cardBorder,
    marginHorizontal: Spacing.xs,
    marginBottom: 14,
  },
  stepBarActive: {
    backgroundColor: Colors.dispatchGreen,
  },
  stepLabel: {
    ...Typography.micro,
    color: Colors.textSecondary,
    fontSize: 10,
  },
  customerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: Radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  customerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  customerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  customerName: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  destinationText: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  callButton: {
    backgroundColor: Colors.surfaceLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  callIcon: {
    fontSize: 14,
  },
  callText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  actionButton: {
    marginTop: Spacing.xs,
  },
});
