import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';

export interface StatusTelemetryPillProps {
  statusText: string;
  badgeText?: string;
  indicatorColor?: string;
  variant?: 'green' | 'amber' | 'red' | 'blue';
}

export function StatusTelemetryPill({
  statusText,
  badgeText = 'GHANA',
  variant = 'green',
}: StatusTelemetryPillProps): React.JSX.Element {
  const getDotColor = (): string => {
    switch (variant) {
      case 'green':
        return Colors.dispatchGreen;
      case 'amber':
        return Colors.amberAlert;
      case 'red':
        return Colors.dangerRed;
      case 'blue':
        return Colors.harborBlue;
    }
  };

  const getBorderColor = (): string => {
    switch (variant) {
      case 'green':
        return 'rgba(0, 200, 83, 0.3)';
      case 'amber':
        return 'rgba(255, 109, 0, 0.3)';
      case 'red':
        return 'rgba(255, 59, 48, 0.3)';
      case 'blue':
        return 'rgba(41, 121, 255, 0.3)';
    }
  };

  return (
    <View style={[styles.pillContainer, { borderColor: getBorderColor() }]}>
      <View style={styles.leftSection}>
        <View style={[styles.dot, { backgroundColor: getDotColor() }]} />
        <Text style={styles.statusText}>{statusText}</Text>
      </View>
      {badgeText && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pillContainer: {
    height: 44,
    backgroundColor: 'rgba(22, 27, 38, 0.85)',
    borderRadius: Radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  badge: {
    backgroundColor: 'rgba(40, 49, 66, 0.8)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.pill,
  },
  badgeText: {
    ...Typography.micro,
    color: Colors.amberLight,
  },
});
