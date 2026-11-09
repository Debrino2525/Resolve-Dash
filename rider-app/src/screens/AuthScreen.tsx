import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusTelemetryPill } from '../components/StatusTelemetryPill';
import { TactileButton } from '../components/TactileButton';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';

export interface AuthScreenProps {
  onSendOtp: (email: string) => Promise<void>;
  onVerifyOtp: (
    email: string,
    code: string,
    fullName: string,
    phoneNumber: string,
  ) => Promise<void>;
  loading: boolean;
  errorMessage: string | null;
}

export function AuthScreen({
  onSendOtp,
  onVerifyOtp,
  loading,
  errorMessage,
}: AuthScreenProps): React.JSX.Element {
  const [step, setStep] = useState<'INPUT' | 'OTP'>('INPUT');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const formattedPhoneNumber = `+233${phoneDigits.replace(/^0+/, '')}`;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleInputSubmit = async (): Promise<void> => {
    if (!isEmailValid || fullName.trim().length < 2 || phoneDigits.length < 9) return;
    try {
      await onSendOtp(email.trim());
      setStep('OTP');
    } catch {
      // Error is caught and surfaced in parent state banner
    }
  };

  const handleOtpSubmit = async (): Promise<void> => {
    if (otpCode.trim().length < 6) return;
    try {
      await onVerifyOtp(email.trim(), otpCode.trim(), fullName.trim(), formattedPhoneNumber);
    } catch {
      // Error is caught and surfaced in parent state banner
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Branding */}
        <View style={styles.brandContainer}>
          <Text style={styles.brandLogo}>GhanaDash 🏍️</Text>
          <Text style={styles.hubSubtitle}>Takoradi Coastal & Harbor Logistics Hub</Text>
        </View>

        <StatusTelemetryPill
          statusText="TAKORADI DISPATCH NETWORK"
          badgeText="ONLINE"
          variant="green"
        />

        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
          </View>
        )}

        {step === 'INPUT' ? (
          <View style={styles.authCard}>
            <Text style={styles.cardTitle}>Rider Dispatch Sign-In</Text>
            <Text style={styles.cardSubtitle}>
              Enter your details to receive a 6-digit verification code directly to your email.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>FULL LEGAL NAME (FOR GIG ID)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Kofi Mensah"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL ADDRESS (FOR SECURE OTP)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="rider@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>MOBILE PHONE (FOR DISPATCH & CALLS)</Text>
              <View style={styles.phoneInputRow}>
                <View style={styles.flagPrefix}>
                  <Text style={styles.flagText}>🇬🇭 +233</Text>
                </View>
                <TextInput
                  style={[styles.textInput, styles.phoneTextInput]}
                  placeholder="24 123 4567"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phoneDigits}
                  onChangeText={setPhoneDigits}
                />
              </View>
            </View>

            <TactileButton
              title="Send Verification Code ✉️"
              variant="primary"
              onPress={handleInputSubmit}
              loading={loading}
              disabled={
                !isEmailValid || fullName.trim().length < 2 || phoneDigits.length < 9
              }
              style={styles.submitButton}
            />
          </View>
        ) : (
          <View style={styles.authCard}>
            <Text style={styles.cardTitle}>Enter 6-Digit Passcode</Text>
            <Text style={styles.cardSubtitle}>
              Sent to <Text style={styles.emailHighlight}>{email.trim()}</Text>
            </Text>

            <View style={styles.inputGroup}>
              <TextInput
                style={styles.otpInput}
                placeholder="• • • • • •"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                value={otpCode}
                onChangeText={setOtpCode}
              />
            </View>

            <TactileButton
              title="Verify & Enter Hub ⚡"
              variant="primary"
              onPress={handleOtpSubmit}
              loading={loading}
              disabled={otpCode.trim().length < 6}
              style={styles.submitButton}
            />

            <TactileButton
              title="Change Email Address"
              variant="secondary"
              onPress={() => setStep('INPUT')}
              style={styles.backButton}
            />
          </View>
        )}
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
    marginBottom: Spacing.lg,
  },
  brandLogo: {
    ...Typography.h1,
    fontSize: 32,
    color: Colors.textPrimary,
  },
  hubSubtitle: {
    ...Typography.micro,
    color: Colors.dispatchGreen,
    marginTop: 4,
    textTransform: 'uppercase',
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
  emailHighlight: {
    color: Colors.dispatchGreen,
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
  phoneInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  flagPrefix: {
    backgroundColor: Colors.cardHover,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  flagText: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
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
  phoneTextInput: {
    flex: 1,
    letterSpacing: 1.5,
  },
  otpInput: {
    backgroundColor: Colors.background,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.dispatchGreen,
    color: Colors.textPrimary,
    paddingVertical: 18,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 8,
  },
  submitButton: {
    marginTop: Spacing.sm,
  },
  backButton: {
    marginTop: Spacing.sm,
  },
});
