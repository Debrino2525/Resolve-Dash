import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { appleSignInAvailable } from '../auth/supabase';
import {
  Alert,
  LegalNote,
  OrDivider,
  PhoneField,
  PillButton,
  SegmentedTabs,
  SocialButton,
} from '../components/auth/AuthParts';
import { InlineNotice } from '../components/InlineNotice';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import { toGhanaE164 } from '../utils/phone';

export type EmailMode = 'sign_in' | 'sign_up';
export type AuthTab = 'sign_in' | 'sign_up';
export type AuthBusy = 'google' | 'apple' | 'email' | 'phone' | null;

export interface SignUpDetails {
  firstName: string;
  lastName: string;
  email: string | null;
}

export interface AuthScreenProps {
  initialTab?: AuthTab;
  /** Start with the email form open (from "Use email instead" on Welcome back). */
  startWithEmail?: boolean;
  onBack?: () => void;
  busy: AuthBusy;
  errorMessage: string | null;
  infoMessage: string | null;
  onGoogle: () => Promise<void>;
  onApple: () => Promise<void>;
  /** Sends the SMS code. `signUp` is set when coming from the Sign Up tab. */
  onPhone: (phoneE164: string, signUp: SignUpDetails | null) => Promise<void>;
  onEmailSubmit: (mode: EmailMode, email: string, password: string) => Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign In / Sign Up (Figma "GhanaDash - Sign In & Verification" and "Sign Up & Onboarding").
 * Phone + SMS code first; Google, Apple (iPhone) and email as alternatives.
 */
export function AuthScreen({
  initialTab = 'sign_in',
  startWithEmail = false,
  onBack,
  busy,
  errorMessage,
  infoMessage,
  onGoogle,
  onApple,
  onPhone,
  onEmailSubmit,
}: AuthScreenProps): React.JSX.Element {
  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [useEmail, setUseEmail] = useState(startWithEmail);
  const [emailMode, setEmailMode] = useState<EmailMode>('sign_in');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [tried, setTried] = useState(false);
  const [apple, setApple] = useState(false);

  useEffect(() => {
    void appleSignInAvailable().then(setApple);
  }, []);

  const e164 = toGhanaE164(phone);
  const phoneBad = tried && !e164;
  const firstBad = tried && firstName.trim().length < 1;
  const lastBad = tried && lastName.trim().length < 1;
  const contactEmailBad = tried && contactEmail.trim().length > 0 && !EMAIL_RE.test(contactEmail.trim());
  const emailFormOk = EMAIL_RE.test(email.trim()) && password.length >= 6;

  const switchTab = (t: AuthTab): void => {
    setTab(t);
    setTried(false);
    setUseEmail(false);
  };

  const submitPhone = (): void => {
    setTried(true);
    if (!e164 || busy) return;
    if (tab === 'sign_up') {
      if (!firstName.trim() || !lastName.trim() || contactEmailBad) return;
      void onPhone(e164, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: contactEmail.trim() ? contactEmail.trim().toLowerCase() : null,
      }).catch(() => undefined);
    } else {
      void onPhone(e164, null).catch(() => undefined);
    }
  };

  const submitEmail = (): void => {
    if (!emailFormOk || busy) return;
    void onEmailSubmit(emailMode, email.trim(), password).catch(() => undefined);
  };

  const social = (
    <View style={styles.socialStack}>
      <SocialButton kind="google" label="Continue with Google" onPress={() => void onGoogle().catch(() => undefined)} loading={busy === 'google'} disabled={busy !== null} />
      {apple && (
        <SocialButton kind="apple" label="Continue with Apple" onPress={() => void onApple().catch(() => undefined)} loading={busy === 'apple'} disabled={busy !== null} />
      )}
    </View>
  );

  const notices = (
    <>
      {errorMessage && <InlineNotice tone="error" text={errorMessage} />}
      {infoMessage && <InlineNotice tone="info" text={infoMessage} />}
    </>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.back} />
        )}
        <SegmentedTabs
          tabs={[
            { key: 'sign_in', label: 'Sign In' },
            { key: 'sign_up', label: 'Sign Up' },
          ]}
          value={tab}
          onChange={switchTab}
        />
        <View style={styles.back} />
      </View>

      <View style={styles.banner}>
        <Ionicons name={tab === 'sign_in' ? 'cube-outline' : 'bicycle-outline'} size={16} color={Colors.dispatchGreenLight} />
        <Text style={styles.bannerText}>
          {tab === 'sign_in'
            ? 'Sign in to track your deliveries and saved places'
            : 'Create your account to send packages across town'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {tab === 'sign_in' ? (
          useEmail ? (
            <View style={styles.form}>
              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor={Colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
              />
              <Text style={styles.label}>{emailMode === 'sign_up' ? 'CHOOSE A PASSWORD (6+ CHARACTERS)' : 'PASSWORD'}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry
                autoComplete={emailMode === 'sign_up' ? 'new-password' : 'current-password'}
                textContentType={emailMode === 'sign_up' ? 'newPassword' : 'password'}
                onSubmitEditing={submitEmail}
              />
              <TouchableOpacity onPress={() => setEmailMode(emailMode === 'sign_in' ? 'sign_up' : 'sign_in')} style={styles.linkBtn}>
                <Text style={styles.link}>
                  {emailMode === 'sign_in' ? 'New here? Create an account with email' : 'Already have an account? Sign in'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setUseEmail(false)} style={styles.linkBtn}>
                <Text style={styles.link}>Use phone number instead</Text>
              </TouchableOpacity>
              {notices}
            </View>
          ) : (
            <View style={styles.form}>
              {social}
              <OrDivider label="or continue with phone number" />
              <View style={styles.labels}>
                <Text style={[styles.label, styles.countryLabel]}>COUNTRY</Text>
                <Text style={styles.label}>PHONE</Text>
              </View>
              <PhoneField value={phone} onChangeText={setPhone} invalid={phoneBad} onSubmitEditing={submitPhone} />
              <TouchableOpacity onPress={() => setUseEmail(true)} style={styles.linkBtn}>
                <Text style={styles.link}>Use email instead</Text>
              </TouchableOpacity>
              {phoneBad && (
                <Alert
                  title="Please check your phone number"
                  body="We couldn't verify this number. Please enter a valid Ghana mobile number (MTN, Telecel or AT)."
                />
              )}
              {notices}
            </View>
          )
        ) : (
          <View style={styles.form}>
            <View style={styles.nameRow}>
              <View style={styles.flex}>
                <Text style={styles.fieldLabel}>First Name</Text>
                <TextInput
                  style={[styles.input, firstBad && styles.inputBad]}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="e.g. Kwesi"
                  placeholderTextColor={Colors.textMuted}
                  autoComplete="given-name"
                  textContentType="givenName"
                  autoCapitalize="words"
                />
                {firstBad && <FieldError text="First name is required" />}
              </View>
              <View style={styles.flex}>
                <Text style={styles.fieldLabel}>Last Name</Text>
                <TextInput
                  style={[styles.input, lastBad && styles.inputBad]}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="e.g. Mensah"
                  placeholderTextColor={Colors.textMuted}
                  autoComplete="family-name"
                  textContentType="familyName"
                  autoCapitalize="words"
                />
                {lastBad && <FieldError text="Last name is required" />}
              </View>
            </View>
            <Text style={styles.fieldLabel}>Email (optional)</Text>
            <TextInput
              style={[styles.input, contactEmailBad && styles.inputBad]}
              value={contactEmail}
              onChangeText={setContactEmail}
              placeholder="name@example.com"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />
            {contactEmailBad && <FieldError text="Check this email address" />}
            <Text style={styles.fieldLabel}>Mobile Number</Text>
            <PhoneField value={phone} onChangeText={setPhone} invalid={phoneBad} onSubmitEditing={submitPhone} />
            {phoneBad && <FieldError text="Enter a Ghana mobile number (MTN, Telecel or AT)" />}
            {notices}
            <LegalNote action="Sign Up" />
            <PillButton title="Sign Up" onPress={submitPhone} loading={busy === 'phone'} disabled={busy !== null} />
            <OrDivider label="or" />
            {social}
          </View>
        )}
      </ScrollView>

      {tab === 'sign_in' && (
        <View style={styles.footer}>
          {useEmail ? (
            <PillButton
              title={emailMode === 'sign_in' ? 'Sign In' : 'Create Account'}
              onPress={submitEmail}
              loading={busy === 'email'}
              disabled={!emailFormOk || busy !== null}
            />
          ) : (
            <PillButton title="Continue" onPress={submitPhone} loading={busy === 'phone'} disabled={busy !== null} />
          )}
          <LegalNote action="Continue" />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function FieldError({ text }: { text: string }): React.JSX.Element {
  return (
    <View style={styles.fieldError}>
      <Ionicons name="alert-circle" size={14} color={Colors.dangerRed} />
      <Text style={styles.fieldErrorText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.card },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 11,
    backgroundColor: Colors.dispatchGreenGlow,
  },
  bannerText: { ...Typography.caption, color: Colors.dispatchGreenLight, flex: 1 },
  scroll: { padding: Spacing.xl, paddingBottom: Spacing.huge },
  form: { gap: Spacing.md },
  socialStack: { gap: Spacing.md },
  labels: { flexDirection: 'row' },
  countryLabel: { width: 108 },
  label: { ...Typography.micro, color: Colors.textSecondary, letterSpacing: 0.8 },
  fieldLabel: { ...Typography.caption, fontWeight: '700', color: Colors.textPrimary, marginBottom: -4 },
  input: {
    minHeight: 50,
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.lg,
    ...Typography.body,
    color: Colors.textPrimary,
  },
  inputBad: { borderColor: Colors.dangerRed, backgroundColor: '#FFF7F6' },
  nameRow: { flexDirection: 'row', gap: Spacing.md },
  fieldError: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  fieldErrorText: { ...Typography.micro, color: Colors.dangerRed },
  linkBtn: { alignSelf: 'center', minHeight: 32, justifyContent: 'center' },
  link: { ...Typography.caption, fontWeight: '700', color: Colors.textPrimary, textDecorationLine: 'underline' },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
    backgroundColor: Colors.card,
  },
});
