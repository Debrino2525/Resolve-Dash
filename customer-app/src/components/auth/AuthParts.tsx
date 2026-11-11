import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../../theme/theme';

/**
 * Building blocks of the sign-in screens (Figma "GhanaDash - Sign In & Verification"):
 * pill buttons, the Sign In / Sign Up switch, the +233 phone field, social buttons, the
 * 6-box code input and the legal line.
 */

export const TERMS_URL = 'https://ghanadash.globitechcybersolutions.com/terms.html';
export const PRIVACY_URL = 'https://ghanadash.globitechcybersolutions.com/privacy.html';

/** GhanaDash mark: green tile with a parcel. Replace with the logo image when it is ready. */
export function BrandMark({ size = 32 }: { size?: number }): React.JSX.Element {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.28 }]}>
      <Ionicons name="cube" size={size * 0.56} color={Colors.dispatchGreen} />
    </View>
  );
}

export function PillButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  trailingArrow = false,
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  trailingArrow?: boolean;
  style?: ViewStyle;
}): React.JSX.Element {
  const off = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      style={[styles.pill, off && styles.pillOff, style]}
    >
      {loading ? (
        <ActivityIndicator color={Colors.onBrand} />
      ) : (
        <>
          <Text style={[styles.pillText, off && styles.pillTextOff]}>{title}</Text>
          {trailingArrow && <Ionicons name="arrow-forward" size={18} color={off ? Colors.textMuted : Colors.onBrand} />}
        </>
      )}
    </TouchableOpacity>
  );
}

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}): React.JSX.Element {
  return (
    <View style={styles.segment} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={[styles.segmentTab, on && styles.segmentTabOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "🇬🇭 +233 | 024 123 4567". Ghana only, so the country part is a label, not a picker. */
export function PhoneField({
  value,
  onChangeText,
  invalid = false,
  verified = false,
  autoFocus = false,
  onSubmitEditing,
}: {
  value: string;
  onChangeText: (v: string) => void;
  invalid?: boolean;
  verified?: boolean;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
}): React.JSX.Element {
  return (
    <View style={[styles.phoneRow, invalid && styles.fieldInvalid]}>
      <View style={styles.country} accessibilityLabel="Ghana, plus 2 3 3">
        <Text style={styles.flag}>🇬🇭</Text>
        <Text style={styles.countryCode}>+233</Text>
      </View>
      <TextInput
        style={styles.phoneInput}
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/[^\d\s]/g, '').slice(0, 13))}
        placeholder="024 123 4567"
        placeholderTextColor={Colors.textMuted}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        autoFocus={autoFocus}
        returnKeyType="done"
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel="Mobile number"
      />
      {verified && <Ionicons name="checkmark-circle" size={22} color={Colors.dispatchGreen} style={styles.verified} />}
    </View>
  );
}

export function SocialButton({
  kind,
  label,
  onPress,
  loading = false,
  disabled = false,
}: {
  kind: 'google' | 'apple';
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  const apple = kind === 'apple';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      style={[styles.social, apple ? styles.socialApple : styles.socialGoogle, (disabled || loading) && { opacity: 0.6 }]}
    >
      {loading ? (
        <ActivityIndicator color={apple ? '#FFFFFF' : Colors.textPrimary} />
      ) : (
        <>
          <Ionicons name={apple ? 'logo-apple' : 'logo-google'} size={18} color={apple ? '#FFFFFF' : '#4285F4'} />
          <Text style={[styles.socialText, apple && { color: '#FFFFFF' }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function OrDivider({ label }: { label: string }): React.JSX.Element {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

export function Alert({ title, body }: { title: string; body: string }): React.JSX.Element {
  return (
    <View style={styles.alert} accessibilityRole="alert">
      <View style={styles.alertIcon}>
        <Ionicons name="alert" size={14} color="#FFFFFF" />
      </View>
      <View style={styles.flex}>
        <Text style={styles.alertTitle}>{title}</Text>
        <Text style={styles.alertBody}>{body}</Text>
      </View>
    </View>
  );
}

export function LegalNote({ action }: { action: string }): React.JSX.Element {
  return (
    <Text style={styles.legal}>
      By tapping "{action}", you agree to GhanaDash's{' '}
      <Text style={styles.legalLink} onPress={() => void Linking.openURL(TERMS_URL)} accessibilityRole="link">
        Terms of Service
      </Text>{' '}
      and{' '}
      <Text style={styles.legalLink} onPress={() => void Linking.openURL(PRIVACY_URL)} accessibilityRole="link">
        Privacy Policy
      </Text>
      . We text you a one-time code; standard SMS rates may apply.
    </Text>
  );
}

/**
 * Six boxes over one hidden input, so the phone's own "fill code from SMS" suggestion works
 * (iOS oneTimeCode, Android sms-otp) and pasting a whole code fills every box.
 */
export function CodeBoxes({
  value,
  onChange,
  onComplete,
  invalid = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (code: string) => void;
  invalid?: boolean;
}): React.JSX.Element {
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(true);
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setBlink((b) => !b), 530);
    return () => clearInterval(t);
  }, []);

  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Verification code" style={styles.codeRow}>
      {Array.from({ length: 6 }, (_, i) => {
        const digit = value[i];
        const active = focused && i === Math.min(value.length, 5) && value.length < 6;
        return (
          <View
            key={i}
            style={[
              styles.codeBox,
              digit ? styles.codeBoxFilled : null,
              active ? styles.codeBoxActive : null,
              invalid ? styles.fieldInvalid : null,
            ]}
          >
            {digit ? (
              <Text style={styles.codeDigit}>{digit}</Text>
            ) : active ? (
              <View style={[styles.cursor, { opacity: blink ? 1 : 0 }]} />
            ) : (
              <View style={styles.codeDot} />
            )}
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '').slice(0, 6);
          onChange(digits);
          if (digits.length === 6) onComplete?.(digits);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        autoFocus
        maxLength={6}
        style={styles.hiddenInput}
        caretHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mark: { backgroundColor: '#0B3D22', alignItems: 'center', justifyContent: 'center' },
  pill: {
    minHeight: 54,
    borderRadius: Radii.pill,
    backgroundColor: Colors.dispatchGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    shadowColor: Colors.dispatchGreen,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  pillOff: { backgroundColor: Colors.cardBorder, shadowOpacity: 0, elevation: 0 },
  pillText: { ...Typography.bodyBold, fontSize: 17, color: Colors.onBrand },
  pillTextOff: { color: Colors.textMuted },
  segment: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radii.pill,
    padding: 4,
  },
  segmentTab: { paddingVertical: 7, paddingHorizontal: 20, borderRadius: Radii.pill },
  segmentTabOn: { backgroundColor: Colors.textPrimary },
  segmentText: { ...Typography.caption, fontWeight: '700', color: Colors.textSecondary },
  segmentTextOn: { color: '#FFFFFF' },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
    overflow: 'hidden',
  },
  fieldInvalid: { borderColor: Colors.dangerRed, backgroundColor: '#FFF7F6' },
  country: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    alignSelf: 'stretch',
    borderRightWidth: 1,
    borderRightColor: Colors.cardBorder,
    backgroundColor: Colors.surfaceLight,
  },
  flag: { fontSize: 18 },
  countryCode: { ...Typography.bodyBold, color: Colors.textPrimary },
  phoneInput: { flex: 1, ...Typography.body, fontSize: 17, color: Colors.textPrimary, paddingHorizontal: Spacing.md, paddingVertical: 12 },
  verified: { marginRight: Spacing.md },
  social: {
    minHeight: 50,
    borderRadius: Radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  socialGoogle: { backgroundColor: Colors.card, borderWidth: 1.5, borderColor: Colors.cardBorder },
  socialApple: { backgroundColor: '#000000' },
  socialText: { ...Typography.bodyBold, fontSize: 15, color: Colors.textPrimary },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginVertical: Spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.cardBorder },
  dividerText: { ...Typography.micro, color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  alert: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radii.lg,
    backgroundColor: Colors.dangerDark,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
  },
  alertIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dangerRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTitle: { ...Typography.bodyBold, fontSize: 15, color: Colors.textPrimary },
  alertBody: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  legal: { ...Typography.caption, fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  legalLink: { color: Colors.textPrimary, textDecorationLine: 'underline', fontWeight: '600' },
  codeRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  codeBox: {
    flex: 1,
    height: 58,
    maxWidth: 52,
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxFilled: { backgroundColor: Colors.card, borderColor: Colors.cardBorder },
  codeBoxActive: { backgroundColor: Colors.card, borderColor: Colors.dispatchGreen, borderWidth: 2 },
  codeDigit: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  codeDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.cardBorder },
  cursor: { width: 2, height: 26, borderRadius: 1, backgroundColor: Colors.dispatchGreen },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
