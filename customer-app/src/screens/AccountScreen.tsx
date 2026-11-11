import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getRecentPlaces, RecentPlace, updateCustomerProfile } from '../api/backendClient';
import { BrandMark, PillButton } from '../components/auth/AuthParts';
import { InlineNotice } from '../components/InlineNotice';
import { SUPPORT } from '../config/support';
import { Colors, Elevation, Radii, Spacing, Typography } from '../theme/theme';
import { cedis, CustomerOrder, CustomerProfile, isActive } from '../types/orders';
import { formatGhanaLocal } from '../utils/phone';
import { codeVersionLabel } from '../services/codeVersion';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface AccountScreenProps {
  profile: CustomerProfile;
  orders: CustomerOrder[];
  onSignOut: () => Promise<void>;
  onOpenOrder: (id: string) => void;
  onShowOrders: () => void;
  onProfileChange: (p: CustomerProfile) => void;
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

const open = (url: string): void => {
  void Linking.openURL(url).catch(() => Alert.alert('Could not open', url));
};

/** Account (Figma "Account" board): profile, delivery stats, saved places, help, legal, sign out. */
export function AccountScreen({
  profile,
  orders,
  onSignOut,
  onOpenOrder,
  onShowOrders,
  onProfileChange,
}: AccountScreenProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const stats = useMemo(() => {
    const delivered = orders.filter((o) => o.status === 'DELIVERED');
    return {
      delivered: delivered.length,
      spent: delivered.reduce((sum, o) => sum + o.farePesewas, 0),
      active: orders.filter((o) => isActive(o.status)),
    };
  }, [orders]);
  const since = new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const transit = stats.active[0];

  const confirmSignOut = (): void => {
    Alert.alert('Sign out?', 'You can sign back in any time with your phone number.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void onSignOut() },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <BrandMark size={32} />
        <View style={styles.flex}>
          <Text style={styles.brand}>GhanaDash</Text>
          <Text style={styles.brandSub}>ACCOUNT</Text>
        </View>
        <View style={styles.topAvatar}>
          <Text style={styles.topAvatarText}>{initialsOf(profile.fullName)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile */}
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initialsOf(profile.fullName)}</Text>
              </View>
              <View style={styles.avatarBadge}>
                <Ionicons name="shield-checkmark" size={12} color={Colors.dispatchGreenLight} />
              </View>
            </View>
            <View style={styles.flex}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {profile.fullName}
                </Text>
                <Ionicons name="checkmark-circle-outline" size={18} color={Colors.dispatchGreenLight} />
              </View>
              <Text style={styles.contact}>+233 {formatGhanaLocal(profile.phoneNumber).slice(1)}</Text>
              {profile.email ? (
                <Text style={styles.contact} numberOfLines={1}>
                  {profile.email}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setEditing(true)} style={styles.editBtn} accessibilityRole="button" accessibilityLabel="Edit your details">
              <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.statusPill}>
            <View style={styles.dot} />
            <Text style={styles.statusText}>Phone verified · Member since {since}</Text>
            <Text style={styles.city}>TAKORADI</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.flex]}>
            <View style={styles.statHead}>
              <Ionicons name="cube-outline" size={14} color={Colors.dispatchGreenLight} />
              <Text style={styles.statLabel}>DELIVERIES</Text>
            </View>
            <Text style={styles.statValue}>{stats.delivered}</Text>
            <Text style={styles.statSub}>completed</Text>
          </View>
          <View style={[styles.statCard, styles.flex]}>
            <View style={styles.statHead}>
              <Ionicons name="cash-outline" size={14} color={Colors.dispatchGreenLight} />
              <Text style={styles.statLabel}>TOTAL SPENT</Text>
            </View>
            <Text style={styles.statValue}>{cedis(stats.spent)}</Text>
            <Text style={styles.statSub}>paid in cash</Text>
          </View>
        </View>

        {/* In transit */}
        {transit && (
          <TouchableOpacity style={styles.transit} onPress={() => onOpenOrder(transit.id)} accessibilityRole="button">
            <View style={styles.transitIcon}>
              <Ionicons name="bicycle" size={22} color={Colors.dispatchGreenLight} />
            </View>
            <View style={styles.flex}>
              <View style={styles.nameRow}>
                <Text style={styles.rowLabel}>
                  {stats.active.length} {stats.active.length === 1 ? 'package' : 'packages'} in transit
                </Text>
                <View style={styles.liveDot} />
              </View>
              <Text style={styles.rowSub} numberOfLines={1}>
                {transit.pickup.address} → {transit.dropoff.address}
              </Text>
            </View>
            <View style={styles.arrowBtn}>
              <Ionicons name="arrow-forward" size={16} color={Colors.textPrimary} />
            </View>
          </TouchableOpacity>
        )}

        <Section title="Orders & payments">
          <Row icon="cash-outline" label="Payment method" sub="Cash on delivery: pay your rider at drop-off" />
          <Row icon="location-outline" label="Saved delivery addresses" sub="Places from your past deliveries" onPress={() => setPlacesOpen(true)} />
          <Row icon="receipt-outline" label="Delivery history" sub="Every delivery, fare and rider" onPress={onShowOrders} last />
        </Section>

        <Section title="Help & support" note="Takoradi dispatch">
          <Row icon="call-outline" label="Call customer care" sub={SUPPORT.phoneDisplay} onPress={() => open(`tel:${SUPPORT.phoneDial}`)} />
          <Row
            icon="logo-whatsapp"
            label="WhatsApp dispatch desk"
            sub="Quick help with a delivery"
            onPress={() => open(`https://wa.me/${SUPPORT.phoneDial.replace('+', '')}`)}
          />
          <Row icon="mail-outline" label="Email support" sub={SUPPORT.email} onPress={() => open(`mailto:${SUPPORT.email}`)} last />
        </Section>

        <Section title="Preferences & legal">
          <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => open(SUPPORT.privacyUrl)} />
          <Row icon="document-text-outline" label="Terms of service" onPress={() => open(SUPPORT.termsUrl)} />
          <Row
            icon="globe-outline"
            label="Official website"
            sub={SUPPORT.websiteUrl.replace(/^https:\/\//, '')}
            onPress={() => open(SUPPORT.websiteUrl)}
            external
            last
          />
        </Section>

        <TouchableOpacity style={styles.signOut} onPress={confirmSignOut} accessibilityRole="button">
          <Ionicons name="log-out-outline" size={18} color={Colors.dangerRed} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
        <Text style={styles.footer}>
          GhanaDash · v{version} · {codeVersionLabel()}
          {'\n'}Powered by Globitech Cyber Solutions
        </Text>
      </ScrollView>

      <EditDetailsSheet
        visible={editing}
        profile={profile}
        onClose={() => setEditing(false)}
        onSaved={(p) => {
          onProfileChange(p);
          setEditing(false);
        }}
      />
      <SavedPlacesSheet visible={placesOpen} onClose={() => setPlacesOpen(false)} />
    </View>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
        {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
      </View>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  sub,
  onPress,
  last = false,
  external = false,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  onPress?: () => void;
  last?: boolean;
  external?: boolean;
}): React.JSX.Element {
  const body = (
    <>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={Colors.dispatchGreenLight} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {onPress ? <Ionicons name={external ? 'open-outline' : 'chevron-forward'} size={18} color={Colors.textMuted} /> : null}
    </>
  );
  return onPress ? (
    <TouchableOpacity style={[styles.row, !last && styles.rowDivider]} onPress={onPress} accessibilityRole="button">
      {body}
    </TouchableOpacity>
  ) : (
    <View style={[styles.row, !last && styles.rowDivider]}>{body}</View>
  );
}

function EditDetailsSheet({
  visible,
  profile,
  onClose,
  onSaved,
}: {
  visible: boolean;
  profile: CustomerProfile;
  onClose: () => void;
  onSaved: (p: CustomerProfile) => void;
}): React.JSX.Element {
  const [name, setName] = useState(profile.fullName);
  const [email, setEmail] = useState(profile.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(profile.fullName);
    setEmail(profile.email ?? '');
    setError(null);
  }, [visible, profile]);

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await updateCustomerProfile(name.trim(), email.trim() || null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your details');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Your details</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.editBtn}>
              <Ionicons name="close" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Full name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" />
            <Text style={styles.fieldLabel}>Email (optional)</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="name@example.com"
              placeholderTextColor={Colors.textMuted}
            />
            <Text style={styles.fieldLabel}>Mobile number</Text>
            <View style={[styles.input, styles.readOnly]}>
              <Text style={styles.readOnlyText}>+233 {formatGhanaLocal(profile.phoneNumber).slice(1)}</Text>
              <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
            </View>
            <Text style={styles.hint}>Your number is verified by SMS. To change it, contact customer care.</Text>
            {error && <InlineNotice tone="error" text={error} />}
            <PillButton title="Save" onPress={() => void save()} loading={busy} disabled={name.trim().length < 2} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function SavedPlacesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }): React.JSX.Element {
  const [places, setPlaces] = useState<RecentPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPlaces(null);
    setError(null);
    getRecentPlaces()
      .then(setPlaces)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your places'));
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Saved delivery addresses</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.editBtn}>
            <Ionicons name="close" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          <Text style={styles.hint}>
            Places you've sent from or to are saved here and offered first when you book. Tap one in the pickup or
            drop-off search to use it.
          </Text>
          {error && <InlineNotice tone="error" text={error} />}
          {places === null && !error && <ActivityIndicator color={Colors.dispatchGreen} />}
          {places?.length === 0 && <Text style={styles.empty}>No saved places yet. They appear after your first delivery.</Text>}
          {places && places.length > 0 && (
            <View style={styles.group}>
              {places.map((p, i) => (
                <Row
                  key={`${p.lat},${p.lng}`}
                  icon="location"
                  label={p.address}
                  sub={[p.landmark, p.gpsCode].filter(Boolean).join(' · ') || undefined}
                  last={i === places.length - 1}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  brand: { ...Typography.h3, color: Colors.dispatchGreenLight },
  brandSub: { ...Typography.micro, fontSize: 10, color: Colors.textMuted, letterSpacing: 1 },
  topAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dispatchGreenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topAvatarText: { ...Typography.micro, color: Colors.textInverse },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.huge },
  profileCard: { padding: Spacing.lg, gap: Spacing.md, borderRadius: Radii.xl, backgroundColor: Colors.card, ...Elevation.card },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.dispatchGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: Colors.onBrand },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...Typography.h3, fontSize: 18, color: Colors.textPrimary, flexShrink: 1 },
  contact: { ...Typography.caption, color: Colors.textSecondary },
  editBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceLight,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.dispatchGreen },
  statusText: { ...Typography.caption, fontSize: 12, color: Colors.textPrimary, flex: 1 },
  city: { ...Typography.micro, fontSize: 10, color: Colors.dispatchGreenLight, letterSpacing: 1 },
  statsRow: { flexDirection: 'row', gap: Spacing.md },
  statCard: { padding: Spacing.lg, borderRadius: Radii.xl, backgroundColor: Colors.card, gap: 4, ...Elevation.card },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statLabel: { ...Typography.micro, fontSize: 10, color: Colors.textMuted, letterSpacing: 0.8 },
  statValue: { ...Typography.h2, color: Colors.textPrimary, marginTop: 4 },
  statSub: { ...Typography.caption, fontSize: 12, color: Colors.dispatchGreenLight },
  transit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radii.xl,
    backgroundColor: Colors.card,
    ...Elevation.card,
  },
  transitIcon: {
    width: 44,
    height: 44,
    borderRadius: Radii.md,
    backgroundColor: Colors.dispatchGreenGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.dispatchGreen },
  arrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { gap: Spacing.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { ...Typography.micro, fontSize: 11, color: Colors.textMuted, letterSpacing: 1 },
  sectionNote: { ...Typography.micro, fontSize: 11, color: Colors.dispatchGreenLight },
  group: { borderRadius: Radii.xl, backgroundColor: Colors.card, paddingHorizontal: Spacing.lg, ...Elevation.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 14, minHeight: 60 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.cardBorder },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { ...Typography.bodyBold, fontSize: 15, color: Colors.textPrimary },
  rowSub: { ...Typography.caption, fontSize: 12, color: Colors.textMuted },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 52,
    borderRadius: Radii.pill,
    backgroundColor: Colors.dangerDark,
  },
  signOutText: { ...Typography.bodyBold, color: Colors.dangerRed },
  footer: { ...Typography.caption, fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  sheet: { flex: 1, backgroundColor: Colors.background },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  sheetTitle: { ...Typography.h2, color: Colors.textPrimary },
  sheetBody: { padding: Spacing.lg, gap: Spacing.md },
  fieldLabel: { ...Typography.caption, fontWeight: '700', color: Colors.textPrimary, marginBottom: -4 },
  input: {
    minHeight: 50,
    borderRadius: Radii.md,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    paddingHorizontal: Spacing.lg,
    ...Typography.body,
    color: Colors.textPrimary,
  },
  readOnly: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceLight },
  readOnlyText: { ...Typography.body, color: Colors.textSecondary },
  hint: { ...Typography.caption, color: Colors.textMuted },
  empty: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.lg },
});
