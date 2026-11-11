import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyDocuments } from '../api/backendClient';
import { SUPPORT } from '../config/support';
import { Colors, Elevation, Radii, Spacing, Typography } from '../theme/theme';
import { cedis } from '../types/dispatch';
import { DocumentChecklist, DocumentChecklistItem } from '../types/documents';
import { SubscriptionDetails } from '../types/subscription';
import { formatGhanaLocal } from '../utils/phone';
import { AuthImage } from './AuthImage';
import { BrandMark } from './auth/AuthParts';
import { DocumentUploadSheet } from './DocumentUploadSheet';
import { InlineNotice } from './InlineNotice';
import { initialsOf } from './ScreenTopBar';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface AccountSheetProps {
  visible: boolean;
  onClose: () => void;
  riderName: string;
  email: string | null;
  phoneNumber: string | null;
  /** Approved riders only (the dashboard passes these); pending riders see profile, help and legal. */
  work?: {
    online: boolean;
    today: { completed: number; cashPesewas: number };
    subscription: SubscriptionDetails | null;
    onRenewSubscription: () => void;
    renewLoading: boolean;
  };
  onSignOut: () => Promise<void>;
}

const open = (url: string): void => {
  void Linking.openURL(url).catch(() => Alert.alert('Could not open', url));
};

const dateOf = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** Plan line for the subscription row: what state it is in and until when. */
function planSummary(s: SubscriptionDetails | null): { label: string; sub: string; tone: 'ok' | 'warn' | 'bad' } {
  if (!s) return { label: 'Rider plan', sub: 'Loading…', tone: 'ok' };
  switch (s.status) {
    case 'TRIAL':
      return { label: 'Free trial', sub: `Until ${dateOf(s.trialEndsAt)}`, tone: 'ok' };
    case 'ACTIVE':
      return { label: 'Plan active', sub: `Paid until ${dateOf(s.paidUntil)}`, tone: 'ok' };
    case 'GRACE_PERIOD':
      return { label: 'Renew soon', sub: `Grace period ends ${dateOf(s.graceEndsAt)}`, tone: 'warn' };
    default:
      return { label: 'Plan expired', sub: 'Renew to take delivery requests again', tone: 'bad' };
  }
}

/**
 * Rider account (Figma "Account" board, rider version): profile, today's trips and cash, plan
 * and renewal, documents, help, legal and sign out. Opened from the avatar on the dashboard.
 */
export function AccountSheet({
  visible,
  onClose,
  riderName,
  email,
  phoneNumber,
  work,
  onSignOut,
}: AccountSheetProps): React.JSX.Element {
  const [docsOpen, setDocsOpen] = useState(false);
  /** The rider's documents, for their profile photo (avatar and the "add photo" prompt). */
  const [checklist, setChecklist] = useState<DocumentChecklist | null>(null);
  const [photoItem, setPhotoItem] = useState<DocumentChecklistItem | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);

  useEffect(() => {
    if (!visible) return;
    getMyDocuments()
      .then(setChecklist)
      .catch(() => setChecklist(null));
  }, [visible]);

  const photo = checklist?.items.find((i) => i.docType === 'PROFILE_PHOTO') ?? null;
  const hasPhoto = Boolean(photo && photo.status !== 'MISSING');
  const photoNeedsAction = Boolean(photo && (photo.status === 'MISSING' || photo.status === 'REJECTED'));
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const subscription = work?.subscription ?? null;
  const plan = planSummary(subscription);
  const planColor = plan.tone === 'ok' ? Colors.dispatchGreenLight : plan.tone === 'warn' ? Colors.amberLight : Colors.dangerRed;

  const confirmSignOut = (): void => {
    Alert.alert('Sign out of GhanaDash?', 'You go offline and stop getting delivery requests until you sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          onClose();
          void onSignOut();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close account">
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <BrandMark size={32} />
          <View style={styles.flex}>
            <Text style={styles.brand}>GhanaDash</Text>
            <Text style={styles.brandSub}>RIDER ACCOUNT</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <View>
                {hasPhoto ? (
                  <AuthImage
                    key={photoVersion}
                    path="/riders/me/documents/profile-photo"
                    style={styles.avatarPhoto}
                  />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsOf(riderName)}</Text>
                  </View>
                )}
                <View style={styles.avatarBadge}>
                  <Ionicons name="shield-checkmark" size={12} color={Colors.dispatchGreenLight} />
                </View>
              </View>
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {riderName}
                  </Text>
                  <Ionicons name="checkmark-circle-outline" size={18} color={Colors.dispatchGreenLight} />
                </View>
                {phoneNumber ? <Text style={styles.contact}>+233 {formatGhanaLocal(phoneNumber).slice(1)}</Text> : null}
                {email ? (
                  <Text style={styles.contact} numberOfLines={1}>
                    {email}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.statusPill}>
              <View style={[styles.dot, { backgroundColor: work?.online ? Colors.dispatchGreen : work ? Colors.textMuted : Colors.amberAlert }]} />
              <Text style={styles.statusText}>
                {work ? `Approved rider · ${work.online ? 'Online' : 'Offline'}` : 'Awaiting approval'}
              </Text>
              <Text style={styles.city}>TAKORADI</Text>
            </View>
          </View>

          {photoNeedsAction && photo && (
            <TouchableOpacity style={styles.photoPrompt} onPress={() => setPhotoItem(photo)} accessibilityRole="button">
              <Ionicons name="camera" size={20} color={Colors.onBrand} />
              <View style={styles.flex}>
                <Text style={styles.photoPromptTitle}>
                  {photo.status === 'REJECTED' ? 'Retake your profile photo' : 'Add your profile photo'}
                </Text>
                <Text style={styles.photoPromptSub}>
                  {photo.status === 'REJECTED' && photo.reviewNote
                    ? photo.reviewNote
                    : 'Customers see it during deliveries so they know who is coming.'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.onBrand} />
            </TouchableOpacity>
          )}
          {photo?.status === 'SUBMITTED' && (
            <Text style={styles.photoPending}>Profile photo sent: customers see it once our team approves it.</Text>
          )}

          {work && (
          <>
          <View style={styles.statsRow}>
            <Stat icon="bicycle-outline" label="TRIPS TODAY" value={String(work.today.completed)} sub="completed" />
            <Stat icon="cash-outline" label="CASH TODAY" value={cedis(work.today.cashPesewas)} sub="collected" />
          </View>

          <Section title="Work">
            <View style={[styles.row, styles.rowDivider]}>
              <View style={styles.rowIcon}>
                <Ionicons name="card-outline" size={18} color={planColor} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowLabel}>{plan.label}</Text>
                <Text style={styles.rowSub}>{plan.sub}</Text>
              </View>
              {subscription && subscription.status !== 'TRIAL' && plan.tone !== 'ok' && (
                <TouchableOpacity onPress={work.onRenewSubscription} disabled={work.renewLoading} style={styles.renewBtn} accessibilityRole="button">
                  {work.renewLoading ? <ActivityIndicator color={Colors.onBrand} size="small" /> : <Text style={styles.renewText}>Renew</Text>}
                </TouchableOpacity>
              )}
              {subscription && plan.tone === 'ok' && (
                <Text style={styles.price}>{cedis(subscription.pricePesewas)}/mo</Text>
              )}
            </View>
            <Row icon="document-text-outline" label="My documents" sub="Ghana Card, licence, roadworthy, insurance" onPress={() => setDocsOpen(true)} last />
          </Section>
          </>
          )}

          <Section title="Help & support" note="Takoradi dispatch">
            <Row icon="call-outline" label="Call dispatch" sub={SUPPORT.phoneDisplay} onPress={() => open(`tel:${SUPPORT.phoneDial}`)} />
            <Row
              icon="logo-whatsapp"
              label="WhatsApp dispatch desk"
              sub="Help with a delivery or customer"
              onPress={() => open(`https://wa.me/${SUPPORT.phoneDial.replace('+', '')}`)}
            />
            <Row icon="mail-outline" label="Email support" sub={SUPPORT.email} onPress={() => open(`mailto:${SUPPORT.email}`)} last />
          </Section>

          <Section title="Legal">
            <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => open(SUPPORT.privacyUrl)} />
            <Row icon="document-outline" label="Terms of service" onPress={() => open(SUPPORT.termsUrl)} />
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
            GhanaDash Rider · v{version}
            {'\n'}Powered by Globitech Cyber Solutions
          </Text>
        </ScrollView>

        <DocumentsModal visible={docsOpen} onClose={() => setDocsOpen(false)} />
        <DocumentUploadSheet
          item={photoItem}
          onClose={() => setPhotoItem(null)}
          onUploaded={(c) => {
            setChecklist(c);
            setPhotoItem(null);
            setPhotoVersion((v) => v + 1);
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

function Stat({ icon, label, value, sub }: { icon: IconName; label: string; value: string; sub: string }): React.JSX.Element {
  return (
    <View style={[styles.statCard, styles.flex]}>
      <View style={styles.statHead}>
        <Ionicons name={icon} size={14} color={Colors.dispatchGreenLight} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
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
  iconColor = Colors.dispatchGreenLight,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  onPress?: () => void;
  last?: boolean;
  external?: boolean;
  iconColor?: string;
}): React.JSX.Element {
  const body = (
    <>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? (
          <Text style={styles.rowSub} numberOfLines={2}>
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

const DOC_UI: Record<DocumentChecklistItem['status'], { icon: IconName; text: string; color: string }> = {
  MISSING: { icon: 'cloud-upload-outline', text: 'Not uploaded', color: Colors.amberLight },
  SUBMITTED: { icon: 'time-outline', text: 'Awaiting review', color: Colors.textSecondary },
  APPROVED: { icon: 'checkmark-circle', text: 'Approved', color: Colors.dispatchGreenLight },
  REJECTED: { icon: 'alert-circle', text: 'Sent back: contact dispatch', color: Colors.dangerRed },
};

function DocumentsModal({ visible, onClose }: { visible: boolean; onClose: () => void }): React.JSX.Element {
  const [docs, setDocs] = useState<DocumentChecklist | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDocs(null);
    setError(null);
    getMyDocuments()
      .then(setDocs)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your documents'));
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close documents">
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.sheetTitle}>My documents</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.hint}>
            These were checked when you were approved. If a document expires or changes, call dispatch to update it.
          </Text>
          {error && <InlineNotice tone="error" text={error} />}
          {!docs && !error && <ActivityIndicator color={Colors.dispatchGreen} />}
          {docs && (
            <View style={styles.group}>
              {docs.items.map((d, i) => {
                const ui = DOC_UI[d.status];
                const detail = [ui.text, d.expiryDate ? `expires ${dateOf(d.expiryDate)}` : null].filter(Boolean).join(' · ');
                return (
                  <Row key={d.docType} icon={ui.icon} iconColor={ui.color} label={d.label} sub={detail} last={i === docs.items.length - 1} />
                );
              })}
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
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  brand: { ...Typography.bodyBold, color: Colors.dispatchGreenLight },
  brandSub: { ...Typography.micro, fontSize: 10, color: Colors.textMuted, letterSpacing: 1 },
  sheetTitle: { ...Typography.h2, color: Colors.textPrimary },
  content: { padding: Spacing.lg, gap: Spacing.lg, paddingBottom: Spacing.huge },
  card: { padding: Spacing.lg, gap: Spacing.md, borderRadius: Radii.xl, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, ...Elevation.card },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.dispatchGreen, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '800', color: Colors.onBrand },
  avatarPhoto: { width: 60, height: 60, borderRadius: 30 },
  photoPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radii.xl,
    backgroundColor: Colors.dispatchGreen,
  },
  photoPromptTitle: { ...Typography.bodyBold, color: Colors.onBrand },
  photoPromptSub: { ...Typography.caption, fontSize: 12, color: Colors.onBrand },
  photoPending: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
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
  name: { ...Typography.bodyBold, fontSize: 18, color: Colors.textPrimary, flexShrink: 1 },
  contact: { ...Typography.caption, color: Colors.textSecondary },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceLight,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { ...Typography.caption, fontSize: 12, color: Colors.textPrimary, flex: 1 },
  city: { ...Typography.micro, fontSize: 10, color: Colors.dispatchGreenLight, letterSpacing: 1 },
  statsRow: { flexDirection: 'row', gap: Spacing.md },
  statCard: { padding: Spacing.lg, borderRadius: Radii.xl, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, gap: 4 },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statLabel: { ...Typography.micro, fontSize: 10, color: Colors.textMuted, letterSpacing: 0.8 },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginTop: 4 },
  statSub: { ...Typography.caption, fontSize: 12, color: Colors.dispatchGreenLight },
  section: { gap: Spacing.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  sectionTitle: { ...Typography.micro, fontSize: 11, color: Colors.textMuted, letterSpacing: 1 },
  sectionNote: { ...Typography.micro, fontSize: 11, color: Colors.dispatchGreenLight },
  group: { borderRadius: Radii.xl, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, paddingHorizontal: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 14, minHeight: 60 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.cardBorder },
  rowIcon: { width: 36, height: 36, borderRadius: Radii.md, backgroundColor: Colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { ...Typography.bodyBold, fontSize: 15, color: Colors.textPrimary },
  rowSub: { ...Typography.caption, fontSize: 12, color: Colors.textMuted },
  renewBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radii.pill, backgroundColor: Colors.dispatchGreen, minWidth: 72, alignItems: 'center' },
  renewText: { ...Typography.micro, color: Colors.onBrand },
  price: { ...Typography.micro, color: Colors.textSecondary },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 52,
    borderRadius: Radii.pill,
    backgroundColor: Colors.dangerDark,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
  },
  signOutText: { ...Typography.bodyBold, color: Colors.dangerRed },
  footer: { ...Typography.caption, fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  hint: { ...Typography.caption, color: Colors.textSecondary },
});
