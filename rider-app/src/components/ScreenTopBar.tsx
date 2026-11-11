import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';

export interface ScreenTopBarProps {
  title: string;
  riderName: string;
  onOpenAccount: () => void;
}

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'GD'
  );
}

/** Simple top bar with the account button (initials) for non-dashboard screens. */
export function ScreenTopBar({ title, riderName, onOpenAccount }: ScreenTopBarProps): React.JSX.Element {
  return (
    <View style={styles.bar}>
      <Text style={styles.title}>{title}</Text>
      <TouchableOpacity
        onPress={onOpenAccount}
        style={styles.avatar}
        accessibilityRole="button"
        accessibilityLabel="Account, support and sign out"
        activeOpacity={0.8}
      >
        <Text style={styles.avatarText}>{initialsOf(riderName)}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radii.pill,
    backgroundColor: Colors.cardHover,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
});
