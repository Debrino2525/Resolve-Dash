import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';

export interface HeaderBarProps {
  riderName: string;
  isOnline: boolean;
  onToggleOnline: () => void;
  canGoOnline: boolean;
  hubName?: string;
}

export function HeaderBar({
  riderName,
  isOnline,
  onToggleOnline,
  canGoOnline,
  hubName = 'Ghana Network',
}: HeaderBarProps): React.JSX.Element {
  const initials = riderName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={styles.headerContainer}>
      <View style={styles.riderProfileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || 'RD'}</Text>
        </View>
        <View style={styles.profileTextContainer}>
          <Text style={styles.riderName}>{riderName}</Text>
          <View style={styles.hubBadge}>
            <Text style={styles.hubText}>{hubName} 🏍️</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onToggleOnline}
        disabled={!canGoOnline && !isOnline}
        style={[
          styles.dutySwitch,
          isOnline ? styles.switchOnline : styles.switchOffline,
          !canGoOnline && !isOnline && styles.switchDisabled,
        ]}
      >
        <View
          style={[
            styles.switchDot,
            isOnline ? styles.dotOnline : styles.dotOffline,
          ]}
        />
        <Text
          style={[
            styles.switchLabel,
            isOnline ? styles.labelOnline : styles.labelOffline,
          ]}
        >
          {isOnline ? 'ON DUTY' : 'OFFLINE'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.md,
  },
  riderProfileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderColor: Colors.dispatchGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  profileTextContainer: {
    justifyContent: 'center',
  },
  riderName: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  hubBadge: {
    marginTop: 2,
  },
  hubText: {
    ...Typography.micro,
    color: Colors.textSecondary,
  },
  dutySwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radii.pill,
    borderWidth: 1,
  },
  switchOnline: {
    backgroundColor: 'rgba(0, 200, 83, 0.15)',
    borderColor: Colors.dispatchGreen,
  },
  switchOffline: {
    backgroundColor: 'rgba(40, 49, 66, 0.4)',
    borderColor: Colors.cardBorder,
  },
  switchDisabled: {
    opacity: 0.5,
  },
  switchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOnline: {
    backgroundColor: Colors.dispatchGreen,
  },
  dotOffline: {
    backgroundColor: Colors.textMuted,
  },
  switchLabel: {
    ...Typography.micro,
    fontWeight: '800',
  },
  labelOnline: {
    color: Colors.dispatchGreen,
  },
  labelOffline: {
    color: Colors.textMuted,
  },
});
