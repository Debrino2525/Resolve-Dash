import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { SUPPORT } from '../config/support';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import { CustomerProfile } from '../types/orders';
import { formatGhanaLocal } from '../utils/phone';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function AccountScreen({
  profile,
  onSignOut,
}: {
  profile: CustomerProfile;
  onSignOut: () => Promise<void>;
}): React.JSX.Element {
  const open = (url: string): void => {
    void Linking.openURL(url).catch(() => Alert.alert('Could not open', url));
  };
  const confirmSignOut = (): void => {
    Alert.alert('Sign out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void onSignOut() },
    ]);
  };
  const initials = profile.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  return (
    <View style={styles.container}>
      <ScreenHeader title="Account" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.name}>{profile.fullName}</Text>
            <Text style={styles.sub}>{formatGhanaLocal(profile.phoneNumber)}</Text>
            {profile.email ? <Text style={styles.sub}>{profile.email}</Text> : null}
          </View>
        </View>

        <Text style={styles.section}>Help</Text>
        <View style={styles.group}>
          <Row icon="call-outline" label={`Call support · ${SUPPORT.phoneDisplay}`} onPress={() => open(`tel:${SUPPORT.phoneDial}`)} />
          <Row icon="logo-whatsapp" label="WhatsApp support" onPress={() => open(`https://wa.me/${SUPPORT.phoneDial.replace('+', '')}`)} />
          <Row icon="mail-outline" label={SUPPORT.email} onPress={() => open(`mailto:${SUPPORT.email}`)} last />
        </View>

        <Text style={styles.section}>About</Text>
        <View style={styles.group}>
          <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => open(SUPPORT.privacyUrl)} />
          <Row icon="document-text-outline" label="Terms of service" onPress={() => open(SUPPORT.termsUrl)} />
          <Row icon="globe-outline" label="Website" onPress={() => open(SUPPORT.websiteUrl)} last />
        </View>

        <TouchableOpacity style={styles.signOut} onPress={confirmSignOut} accessibilityRole="button">
          <Ionicons name="log-out-outline" size={20} color={Colors.dangerRed} />
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
        <Text style={styles.version}>GhanaDash · Globitech Cyber Solutions</Text>
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, onPress, last }: { icon: IconName; label: string; onPress: () => void; last?: boolean }): React.JSX.Element {
  return (
    <TouchableOpacity style={[styles.row, !last && styles.rowDivider]} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={20} color={Colors.textSecondary} />
      <Text style={styles.rowText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.huge },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.lg,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.dispatchGreen, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...Typography.h2, color: Colors.onBrand },
  name: { ...Typography.h2, color: Colors.textPrimary },
  sub: { ...Typography.caption, color: Colors.textSecondary },
  section: { ...Typography.micro, color: Colors.textMuted, marginTop: Spacing.xl, marginBottom: Spacing.sm, marginLeft: Spacing.xs },
  group: { backgroundColor: Colors.card, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.cardBorder },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, minHeight: 54 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.cardBorder },
  rowText: { ...Typography.bodyBold, color: Colors.textPrimary, flex: 1 },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.xxl, minHeight: 48 },
  signOutText: { ...Typography.bodyBold, color: Colors.dangerRed },
  version: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm },
});
