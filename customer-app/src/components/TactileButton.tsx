import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';

export interface TactileButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'amber' | 'danger' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function TactileButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}: TactileButtonProps): React.JSX.Element {
  const getBackgroundColor = (): string => {
    if (disabled) return Colors.cardBorder;
    switch (variant) {
      case 'primary':
        return Colors.dispatchGreen;
      case 'amber':
        return Colors.amberAlert;
      case 'danger':
        return Colors.dangerRed;
      case 'secondary':
        return Colors.cardHover;
      case 'outline':
        return 'transparent';
      default:
        return Colors.dispatchGreen;
    }
  };

  const getTextColor = (): string => {
    if (disabled) return Colors.textMuted;
    if (variant === 'primary') return Colors.onBrand;
    if (variant === 'secondary') return Colors.textPrimary;
    if (variant === 'outline') return Colors.dispatchGreen;
    return '#FFFFFF';
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        { backgroundColor: getBackgroundColor() },
        variant === 'outline' && styles.outlineBorder,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? Colors.onBrand : Colors.textPrimary} />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, { color: getTextColor() }, textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: Radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  outlineBorder: {
    borderWidth: 1.5,
    borderColor: Colors.dispatchGreen,
  },
  text: {
    ...Typography.bodyBold,
    letterSpacing: 0.5,
  },
});
