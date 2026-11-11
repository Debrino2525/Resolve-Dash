import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BrandMark, CodeBoxes, PillButton } from '../components/auth/AuthParts';
import { InlineNotice } from '../components/InlineNotice';
import { Colors, Elevation, Radii, Spacing, Typography } from '../theme/theme';
import { formatGhanaLocal } from '../utils/phone';

const RESEND_AFTER_S = 30;

export interface VerifyCodeScreenProps {
  phoneE164: string;
  busy: boolean;
  error: string | null;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  /** Back to the number, to fix a typo. */
  onEdit: () => void;
}

/** "Enter 6-digit code" (Figma "GhanaDash - SMS Verification"). */
export function VerifyCodeScreen({ phoneE164, busy, error, onVerify, onResend, onEdit }: VerifyCodeScreenProps): React.JSX.Element {
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(RESEND_AFTER_S);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // A failed attempt clears the boxes so the next code can be typed straight away.
  useEffect(() => {
    if (error) setCode('');
  }, [error]);

  const verify = (c: string): void => {
    if (c.length !== 6 || busy) return;
    void onVerify(c).catch(() => undefined);
  };

  const resend = async (): Promise<void> => {
    if (wait > 0 || resending) return;
    setResending(true);
    try {
      await onResend();
      setResent(true);
      setWait(RESEND_AFTER_S);
      setCode('');
    } catch {
      // shown by the parent
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <View style={styles.header}>
        <TouchableOpacity onPress={onEdit} style={styles.back} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <BrandMark size={32} />
        <Text style={styles.brand}>GhanaDash Rider</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.pill}>
          <Ionicons name="pricetag" size={14} color={Colors.dispatchGreenLight} />
          <Text style={styles.pillText}>One code and you're in: no password to remember</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.title} accessibilityRole="header">
              Enter 6-digit code
            </Text>
            <View style={styles.smsIcon}>
              <Ionicons name="chatbox-ellipses-outline" size={18} color={Colors.dispatchGreenLight} />
            </View>
          </View>
          <Text style={styles.sub}>We sent a verification code via SMS to</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.phone}>+233 {formatGhanaLocal(phoneE164).slice(1)}</Text>
            <TouchableOpacity onPress={onEdit} style={styles.edit} accessibilityRole="button" accessibilityLabel="Edit phone number">
              <Ionicons name="pencil" size={12} color={Colors.dispatchGreenLight} />
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.codeLabel}>VERIFICATION CODE</Text>
          <CodeBoxes value={code} onChange={setCode} onComplete={verify} invalid={!!error && code.length === 0} />
          <Text style={styles.hint}>Your phone may offer to fill in the code from the SMS.</Text>

          {error && <InlineNotice tone="error" text={error} />}
          {resent && !error && <InlineNotice tone="info" text="New code sent. It replaces the old one." />}

          <PillButton title="VERIFY & CONTINUE" trailingArrow onPress={() => verify(code)} loading={busy} disabled={code.length !== 6} />

          <View style={styles.resendRow}>
            <Text style={styles.resendQ}>Didn't receive a code?</Text>
            <TouchableOpacity onPress={() => void resend()} disabled={wait > 0 || resending} style={styles.resendBtn} accessibilityRole="button">
              <Text style={[styles.resendText, wait > 0 && { color: Colors.textMuted }]}>
                {resending ? 'Sending…' : wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.trust}>
          <Ionicons name="shield-checkmark-outline" size={16} color={Colors.dispatchGreenLight} />
          <View style={styles.flexShrink}>
            <Text style={styles.trustTitle}>Keep this code to yourself</Text>
            <Text style={styles.trustBody}>
              GhanaDash will never call or text asking for this code, your Mobile Money PIN or your passwords.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  flexShrink: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  brand: { ...Typography.h3, color: Colors.textPrimary },
  scroll: { padding: Spacing.lg, gap: Spacing.lg },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radii.md,
    backgroundColor: Colors.dispatchGreenGlow,
  },
  pillText: { ...Typography.caption, color: Colors.dispatchGreenLight, flex: 1 },
  card: { padding: Spacing.xxl, gap: Spacing.md, borderRadius: Radii.xl, backgroundColor: Colors.card, ...Elevation.card },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...Typography.h1, color: Colors.textPrimary },
  smsIcon: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    backgroundColor: Colors.dispatchGreenGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sub: { ...Typography.body, color: Colors.textSecondary, marginTop: -4 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: -6 },
  phone: { ...Typography.h3, color: Colors.textPrimary },
  edit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radii.sm,
    backgroundColor: Colors.dispatchGreenGlow,
  },
  editText: { ...Typography.micro, color: Colors.dispatchGreenLight },
  codeLabel: { ...Typography.micro, color: Colors.textSecondary, letterSpacing: 0.8, marginTop: Spacing.sm },
  hint: { ...Typography.caption, fontSize: 12, color: Colors.textMuted },
  resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  resendQ: { ...Typography.caption, color: Colors.textSecondary },
  resendBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.sm, backgroundColor: Colors.surfaceLight },
  resendText: { ...Typography.caption, fontWeight: '700', color: Colors.textPrimary },
  trust: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, borderRadius: Radii.lg, backgroundColor: Colors.surfaceLight },
  trustTitle: { ...Typography.micro, color: Colors.textPrimary },
  trustBody: { ...Typography.caption, fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
