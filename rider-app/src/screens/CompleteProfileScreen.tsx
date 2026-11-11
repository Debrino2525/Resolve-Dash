import { InlineNotice } from '../components/InlineNotice';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { sendPhoneVerificationCode, verifyPhoneCode } from '../api/backendClient';
import { StatusTelemetryPill } from '../components/StatusTelemetryPill';
import { TactileButton } from '../components/TactileButton';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import { formatGhanaLocal, toGhanaE164 } from '../utils/phone';

export interface CompleteProfileScreenProps {
  /** Signed-in account, shown so the rider knows which login this profile belongs to. */
  accountEmail: string | null;
  /**
   * Set when the rider signed in with their phone (+233…): Supabase already verified it, so only
   * the name is asked and no second SMS is sent.
   */
  verifiedPhone?: string | null;
  /** Creates the rider profile (with the SMS proof, or null for a verified sign-in phone). */
  onComplete: (fullName: string, phoneVerificationToken: string | null) => Promise<void>;
  onSignOut: () => Promise<void>;
}

type Step = 'details' | 'code';

/**
 * Step 2 of rider access (first sign-in only): legal name + mobile number, confirmed with a
 * 6-digit SMS code sent by the backend via mNotify. The backend only creates the rider profile
 * with a phone number this account has proven it controls.
 */
export function CompleteProfileScreen({
  accountEmail,
  verifiedPhone = null,
  onComplete,
  onSignOut,
}: CompleteProfileScreenProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('details');
  const [fullName, setFullName] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [code, setCode] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneE164 = verifiedPhone ?? toGhanaE164(phoneInput);
  const detailsValid = fullName.trim().length >= 2 && phoneE164 !== null;

  const finishWithVerifiedPhone = async (): Promise<void> => {
    if (fullName.trim().length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onComplete(fullName.trim(), null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your details');
      setBusy(false);
    }
  };

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const sendCode = async (): Promise<void> => {
    if (!phoneE164 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await sendPhoneVerificationCode(phoneE164);
      setVerificationId(res.verificationId);
      setSentTo(res.phoneNumber);
      setResendIn(res.resendAfterSeconds);
      setCode('');
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the SMS code');
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (): Promise<void> => {
    if (!verificationId || code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { phoneVerificationToken } = await verifyPhoneCode(verificationId, code);
      await onComplete(fullName.trim(), phoneVerificationToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the code');
      setBusy(false);
    }
    // On success the parent replaces this screen, so busy is left on deliberately.
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={styles.container}
    >
      <TouchableOpacity
        onPress={() => confirmLeaveProfile(onSignOut)}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel="Back to sign in"
      >
        <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <StatusTelemetryPill
          statusText={
            verifiedPhone ? 'Last step · Your name' : step === 'details' ? 'Step 1 of 2 · Your details' : 'Step 2 of 2 · SMS code'
          }
          badgeText="GHANA"
          variant="blue"
        />

        {error && (
          <View style={styles.errorBox}>
            <InlineNotice tone="error" text={error} />
          </View>
        )}

        <View style={styles.card}>
          {step === 'details' ? (
            <>
              <Text style={styles.title}>Complete your rider profile</Text>
              <Text style={styles.subtitle}>
                {verifiedPhone
                  ? `Your number ${formatGhanaLocal(verifiedPhone)} is confirmed. Enter your name exactly as on your Ghana Card.`
                  : `${accountEmail ? `Signed in as ${accountEmail}. ` : ''}We'll text a code to confirm your mobile number. Dispatch and customers will reach you on it.`}
              </Text>

              <Text style={styles.label}>Full legal name (as on your Ghana Card)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Kofi Mensah"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                value={fullName}
                onChangeText={setFullName}
              />

              {!verifiedPhone && <Text style={styles.label}>Mobile number</Text>}
              {!verifiedPhone && (
              <View style={styles.phoneRow}>
                <View style={styles.flagPrefix}>
                  <Text style={styles.flagText}>🇬🇭 +233</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  placeholder="24 123 4567"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  maxLength={13}
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                />
              </View>
              )}
              {!verifiedPhone && phoneInput.length >= 9 && !phoneE164 && (
                <Text style={styles.hint}>Enter a Ghana mobile number, e.g. 024 123 4567</Text>
              )}

              <TactileButton
                title={verifiedPhone ? 'Finish' : 'Send SMS Code'}
                variant="primary"
                onPress={verifiedPhone ? finishWithVerifiedPhone : sendCode}
                loading={busy}
                disabled={!detailsValid || busy}
                style={styles.primaryButton}
              />
            </>
          ) : (
            <>
              <Text style={styles.title}>Enter the 6-digit code</Text>
              <Text style={styles.subtitle}>
                Sent by SMS to {sentTo ? formatGhanaLocal(sentTo) : 'your phone'}. It expires in 10
                minutes.
              </Text>

              <TextInput
                style={[styles.input, styles.codeInput]}
                placeholder="••••••"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={6}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
                onSubmitEditing={confirmCode}
                autoFocus
              />

              <TactileButton
                title="Verify & Finish"
                variant="primary"
                onPress={confirmCode}
                loading={busy}
                disabled={code.length !== 6 || busy}
                style={styles.primaryButton}
              />

              <View style={styles.linkRow}>
                <TouchableOpacity
                  onPress={sendCode}
                  disabled={resendIn > 0 || busy}
                  accessibilityRole="button"
                >
                  <Text style={[styles.link, (resendIn > 0 || busy) && styles.linkDisabled]}>
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setStep('details');
                    setError(null);
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                >
                  <Text style={styles.link}>Change number</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity onPress={onSignOut} accessibilityRole="button" style={styles.signOut}>
          <Text style={styles.signOutText}>Use a different account</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** "Stop setting up?": signs out, which returns to the sign-in screen. Also used by Android back. */
export function confirmLeaveProfile(onSignOut: () => Promise<void>): void {
  Alert.alert(
    'Stop setting up?',
    'You will go back to the sign-in screen. You can sign in again any time to finish your rider profile.',
    [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Go back', style: 'destructive', onPress: () => void onSignOut() },
    ],
  );
}

const styles = StyleSheet.create({
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: 8, marginTop: 4 },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  errorBox: {
    backgroundColor: Colors.dangerDark,
    borderColor: Colors.dangerBorder,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.dangerRed,
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.xl,
  },
  title: {
    ...Typography.h2,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.micro,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    marginBottom: Spacing.lg,
    ...Typography.bodyBold,
  },
  phoneRow: {
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
    marginBottom: Spacing.lg,
  },
  flagText: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  phoneInput: {
    flex: 1,
    letterSpacing: 1.5,
  },
  hint: {
    ...Typography.caption,
    color: Colors.amberLight,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
  },
  codeInput: {
    fontSize: 28,
    letterSpacing: 12,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: Spacing.xs,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
  },
  link: {
    ...Typography.caption,
    color: Colors.dispatchGreen,
    fontWeight: '700',
  },
  linkDisabled: {
    color: Colors.textMuted,
  },
  signOut: {
    alignSelf: 'center',
    padding: Spacing.sm,
  },
  signOutText: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
});
