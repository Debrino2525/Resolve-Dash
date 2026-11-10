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
  onAuthenticate: (
    email: string,
    password: string,
    fullName: string,
    phoneNumber: string,
  ) => Promise<void>;
  loading: boolean;
  errorMessage: string | null;
}

export function AuthScreen({
  onAuthenticate,
  loading,
  errorMessage,
}: AuthScreenProps): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');

  const formattedPhoneNumber = `+233${phoneDigits.replace(/^0+/, '')}`;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isFormValid =
    isEmailValid &&
    password.length >= 6 &&
    fullName.trim().length >= 2 &&
    phoneDigits.length >= 9;

  const handleSubmit = async (): Promise<void> => {
    if (!isFormValid) return;
    try {
      await onAuthenticate(
        email.trim(),
        password,
        fullName.trim(),
        formattedPhoneNumber,
      );
    } catch {
      // Error handled and displayed by parent state banner
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
          <Text style={styles.hubSubtitle}>Motorbike delivery across Ghana</Text>
        </View>

        <StatusTelemetryPill
          statusText="GHANA DISPATCH NETWORK"
          badgeText="ONLINE"
          variant="green"
        />

        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
          </View>
        )}

        <View style={styles.authCard}>
          <Text style={styles.cardTitle}>Rider Dispatch Sign-In</Text>
          <Text style={styles.cardSubtitle}>
            Sign in or create your rider account. Instant access with zero email or SMS delays.
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
            <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
            <TextInput
              style={styles.textInput}
              placeholder="rider@gmail.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PASSWORD (MIN 6 CHARACTERS)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="••••••••"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>MOBILE NUMBER (FOR DISPATCH & CALLS)</Text>
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
            title="Enter Dispatch Hub ⚡"
            variant="primary"
            onPress={handleSubmit}
            loading={loading}
            disabled={!isFormValid}
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
  submitButton: {
    marginTop: Spacing.sm,
  },
});
