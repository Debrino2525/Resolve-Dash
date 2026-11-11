import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '../theme/theme';

const TONES = {
  error: { icon: 'alert-circle', color: Colors.dangerRed },
  warning: { icon: 'warning', color: Colors.amberLight },
  info: { icon: 'mail-unread', color: Colors.amberLight },
  success: { icon: 'checkmark-circle', color: Colors.dispatchGreenLight },
} as const;

/** Icon + message line used inside error/info boxes (announced to screen readers). */
export function InlineNotice({
  tone,
  text,
}: {
  tone: keyof typeof TONES;
  text: string;
}): React.JSX.Element {
  const t = TONES[tone];
  return (
    <View style={styles.row} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name={t.icon} size={18} color={t.color} style={styles.icon} />
      <Text style={[styles.text, { color: t.color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  icon: {
    marginTop: 1,
  },
  text: {
    ...Typography.caption,
    flex: 1,
  },
});
