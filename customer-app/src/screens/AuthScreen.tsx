import { MaterialCommunityIcons } from '@expo/vector-icons';
import { InlineNotice } from '../components/InlineNotice';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { TactileButton } from '../components/TactileButton';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';

export type EmailMode = 'sign_in' | 'sign_up';

export interface AuthScreenProps {
  onGoogle: () => Promise<void>;
  onEmailSubmit: (mode: EmailMode, email: string, password: string) => Promise<void>;
  /** Which action is in flight, so only that button shows a spinner. */
  busy: 'google' | 'email' | null;
  errorMessage: string | null;
  /** Neutral notice, e.g. "check your inbox to confirm your email". */
  infoMessage: string | null;
}

/**
 * Welcome & sign-in for customers (Google or email). Name and phone are collected once,
 * afterwards, on the Complete Profile screen.
 */
export function AuthScreen({
  onGoogle,
  onEmailSubmit,
  busy,
  errorMessage,
  infoMessage,
}: AuthScreenProps): React.JSX.Element {
  const [mode, setMode] = useState<EmailMode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isFormValid = isEmailValid && password.length >= 6;

  const submitEmail = async (): Promise<void> => {
    if (!isFormValid || busy) return;
    try {
      await onEmailSubmit(mode, email.trim(), password);
    } catch {
      // Displayed by the parent's error banner
    }
  };

  const continueWithGoogle = async (): Promise<void> => {
    if (busy) return;
    try {
      await onGoogle();
    } catch {
      // Displayed by the parent's error banner
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.brandContainer}>
          <View style={styles.brandMark}>
            <MaterialCommunityIcons name="moped" size={38} color={Colors.dispatchGreen} />
          </View>
          <Text style={styles.brandLogo}>GhanaDash</Text>
          <Text style={styles.hubSubtitle}>Send anything across town, delivered by bike</Text>
        </View>

        {errorMessage && (
          <View style={styles.errorBox}>
            <InlineNotice tone="error" text={errorMessage} />
          </View>
        )}
        {infoMessage && (
          <View style={styles.infoBox}>
            <InlineNotice tone="info" text={infoMessage} />
          </View>
        )}

        <View style={styles.authCard}>
          <Text style={styles.cardTitle}>Sign in to send</Text>
          <Text style={styles.cardSubtitle}>
            Continue with Google or email. We'll confirm your phone number by SMS the first time,
            so your rider can reach you.
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            activeOpacity={0.85}
            onPress={continueWithGoogle}
            disabled={busy !== null}
            style={[styles.googleButton, busy !== null && styles.disabled]}
          >
            {busy === 'google' ? (
              <ActivityIndicator color="#1F1F1F" />
            ) : (
              <>
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or use email</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.modeToggle} accessibilityRole="tablist">
            {(['sign_in', 'sign_up'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                onPress={() => setMode(m)}
                style={[styles.modeTab, mode === m && styles.modeTabActive]}
              >
                <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>
                  {m === 'sign_in' ? 'Sign in' : 'Create account'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email address</Text>
            <TextInput
              style={styles.textInput}
              placeholder="you@gmail.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              {mode === 'sign_up' ? 'Choose a password (min. 6 characters)' : 'Password'}
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'}
              textContentType={mode === 'sign_up' ? 'newPassword' : 'password'}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submitEmail}
            />
          </View>

          <TactileButton
            title={mode === 'sign_in' ? 'Sign in' : 'Create account'}
            variant="primary"
            onPress={submitEmail}
            loading={busy === 'email'}
            disabled={!isFormValid || busy !== null}
            style={styles.submitButton}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  brandMark: {
    width: 72,
    height: 72,
    borderRadius: Radii.xl,
    backgroundColor: Colors.dispatchGreenGlow,
    borderWidth: 1,
    borderColor: Colors.dispatchGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  brandMarkIcon: {
    fontSize: 36,
  },
  brandLogo: {
    ...Typography.h1,
    fontSize: 32,
    color: Colors.textPrimary,
  },
  hubSubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  errorBox: {
    backgroundColor: Colors.dangerDark,
    borderColor: Colors.dangerBorder,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginVertical: Spacing.sm,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.dangerRed,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: Colors.amberDark,
    borderColor: Colors.amberBorder,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginVertical: Spacing.sm,
  },
  infoText: {
    ...Typography.caption,
    color: Colors.amberLight,
    textAlign: 'center',
    lineHeight: 18,
  },
  authCard: {
    backgroundColor: Colors.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.xl,
    marginTop: Spacing.md,
  },
  cardTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  cardSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
    lineHeight: 18,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: Radii.lg,
    minHeight: 54,
    paddingHorizontal: Spacing.lg,
  },
  googleG: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4285F4',
  },
  googleText: {
    ...Typography.bodyBold,
    color: '#1F1F1F',
  },
  disabled: {
    opacity: 0.6,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.cardBorder,
  },
  dividerText: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 3,
    marginBottom: Spacing.lg,
  },
  modeTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radii.sm,
  },
  modeTabActive: {
    backgroundColor: Colors.cardHover,
  },
  modeTabText: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  modeTabTextActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    ...Typography.micro,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  textInput: {
    backgroundColor: Colors.background,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    ...Typography.bodyBold,
  },
  submitButton: {
    marginTop: Spacing.sm,
  },
});
