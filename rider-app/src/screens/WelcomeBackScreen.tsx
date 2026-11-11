import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RememberedUser } from '../auth/rememberedUser';
import { Alert, LegalNote, PhoneField, PillButton } from '../components/auth/AuthParts';
import { WelcomeCollage } from '../components/auth/WelcomeCollage';
import { Colors, Elevation, Radii, Spacing, Typography } from '../theme/theme';
import { formatGhanaLocal, toGhanaE164 } from '../utils/phone';

export interface WelcomeBackScreenProps {
  user: RememberedUser;
  busy: boolean;
  error: string | null;
  /** Sends the SMS code to this number (+233…). */
  onContinueWithPhone: (phoneE164: string) => void;
  onUseEmail: () => void;
  /** Forget this person and show the normal sign-in. */
  onUseAnotherAccount: () => void;
}

/** Returning rider on this phone: one tap to get a code to their known number. */
export function WelcomeBackScreen({
  user,
  busy,
  error,
  onContinueWithPhone,
  onUseEmail,
  onUseAnotherAccount,
}: WelcomeBackScreenProps): React.JSX.Element {
  const [phone, setPhone] = useState(formatGhanaLocal(user.phone));
  const e164 = toGhanaE164(phone);
  const unchanged = e164 === user.phone;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <WelcomeCollage />

        <View style={styles.greeting}>
          <Text style={styles.title} accessibilityRole="header">
            Welcome back,{'\n'}
            {user.firstName}!
          </Text>
          <View style={styles.tagRow}>
            <View style={styles.dot} />
            <Text style={styles.tag}>Ready to ride? Takoradi deliveries are waiting</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>You've logged in before</Text>
          <PhoneField
            value={phone}
            onChangeText={setPhone}
            verified={unchanged}
            invalid={phone.trim().length > 0 && !e164}
            onSubmitEditing={() => e164 && onContinueWithPhone(e164)}
          />
          <TouchableOpacity onPress={onUseEmail} style={styles.linkBtn} accessibilityRole="button">
            <Text style={styles.link}>Use email instead</Text>
          </TouchableOpacity>
          {error && <Alert title="We couldn't send your code" body={error} />}
          <PillButton
            title="Continue with Phone"
            trailingArrow
            loading={busy}
            disabled={!e164}
            onPress={() => e164 && onContinueWithPhone(e164)}
            style={styles.cta}
          />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity onPress={onUseAnotherAccount} accessibilityRole="button" style={styles.linkBtn}>
            <Ionicons name="swap-horizontal" size={14} color={Colors.textPrimary} />
            <Text style={styles.linkStrong}>Use another account</Text>
          </TouchableOpacity>
          <LegalNote action="Continue with Phone" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.card },
  scroll: { paddingBottom: Spacing.xxl },
  greeting: { alignItems: 'center', paddingHorizontal: 28, marginTop: Spacing.md },
  title: { ...Typography.display, textAlign: 'center', color: Colors.textPrimary },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.dispatchGreen },
  tag: { ...Typography.caption, color: Colors.textSecondary },
  card: {
    marginHorizontal: Spacing.xxl,
    marginTop: Spacing.xl,
    padding: Spacing.xl,
    gap: Spacing.md,
    borderRadius: Radii.xl,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    ...Elevation.floating,
  },
  cardLabel: { ...Typography.bodyBold, textAlign: 'center', color: Colors.textPrimary },
  cta: { marginTop: Spacing.xs },
  footer: { alignItems: 'center', gap: Spacing.md, paddingHorizontal: 28, marginTop: Spacing.xl },
  linkBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 32 },
  link: { ...Typography.caption, fontWeight: '700', color: Colors.textPrimary, textDecorationLine: 'underline' },
  linkStrong: { ...Typography.caption, fontWeight: '700', color: Colors.textPrimary, textDecorationLine: 'underline' },
});
