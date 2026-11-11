import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import { cedis } from '../types/dispatch';

export interface PinEntrySheetProps {
  visible: boolean;
  receiverName: string;
  farePesewas: number;
  onSubmit: (pin: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Delivery handover: collect the cash, then type the 4-digit PIN the customer or receiver reads
 * out. The server checks it and counts wrong attempts.
 */
export function PinEntrySheet({
  visible,
  receiverName,
  farePesewas,
  onSubmit,
  onClose,
}: PinEntrySheetProps): React.JSX.Element {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setPin('');
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  const submit = async (value = pin): Promise<void> => {
    if (value.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm delivery');
      setPin('');
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
      <KeyboardAvoidingView behavior="padding">
        <View style={styles.sheet}>
          <View style={styles.cash}>
            <Ionicons name="cash" size={22} color={Colors.dispatchGreen} />
            <Text style={styles.cashText}>
              Collect <Text style={styles.cashAmount}>{cedis(farePesewas)}</Text> in cash first
            </Text>
          </View>

          <Text style={styles.title}>Enter delivery PIN</Text>
          <Text style={styles.sub}>Ask {receiverName} for the 4-digit PIN from the GhanaDash app.</Text>

          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={(v) => {
              const digits = v.replace(/\D/g, '').slice(0, 4);
              setPin(digits);
              if (digits.length === 4) void submit(digits);
            }}
            keyboardType="number-pad"
            maxLength={4}
            autoFocus
            editable={!busy}
            placeholder="• • • •"
            placeholderTextColor={Colors.textMuted}
            accessibilityLabel="Delivery PIN"
          />
          {error && (
            <Text style={styles.error} accessibilityLiveRegion="assertive">
              {error}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.confirm, (pin.length !== 4 || busy) && { opacity: 0.5 }]}
            onPress={() => void submit()}
            disabled={pin.length !== 4 || busy}
            accessibilityRole="button"
          >
            <Text style={styles.confirmText}>{busy ? 'Checking…' : 'Confirm delivery'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} disabled={busy} style={styles.cancel} accessibilityRole="button">
            <Text style={styles.cancelText}>Not yet</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Colors.overlay },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    padding: Spacing.xl,
    paddingBottom: Spacing.huge,
    gap: Spacing.md,
  },
  cash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.dispatchGreenGlow,
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  cashText: { ...Typography.body, color: Colors.textPrimary, flex: 1 },
  cashAmount: { ...Typography.bodyBold, color: Colors.dispatchGreenLight },
  title: { ...Typography.h2, color: Colors.textPrimary, marginTop: Spacing.sm },
  sub: { ...Typography.body, color: Colors.textSecondary },
  input: {
    alignSelf: 'center',
    width: 220,
    textAlign: 'center',
    fontSize: 40,
    letterSpacing: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingVertical: Spacing.md,
    marginVertical: Spacing.sm,
  },
  error: { ...Typography.bodyBold, color: Colors.dangerRed, textAlign: 'center' },
  confirm: {
    minHeight: 56,
    borderRadius: Radii.lg,
    backgroundColor: Colors.dispatchGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { ...Typography.h3, color: Colors.onBrand },
  cancel: { alignSelf: 'center', padding: Spacing.md },
  cancelText: { ...Typography.bodyBold, color: Colors.textMuted },
});
