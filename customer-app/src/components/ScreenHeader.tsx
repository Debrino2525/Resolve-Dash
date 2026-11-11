import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Spacing, TOUCH_TARGET, Typography } from '../theme/theme';

/** Simple top bar: back button + title that wraps instead of truncating or overlapping. */
export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.bar}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.btn} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.spacer} />
      )}
      <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.btn}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.cardBorder,
  },
  btn: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  spacer: { width: Spacing.md },
  title: { ...Typography.h3, color: Colors.textPrimary, flex: 1 },
});
