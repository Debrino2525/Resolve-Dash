import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SUPPORT } from '../config/support';
import { Colors, Radii, Spacing, TOUCH_TARGET, Typography } from '../theme/theme';
import { formatGhanaLocal } from '../utils/phone';
import { initialsOf } from './ScreenTopBar';

export interface AccountSheetProps {
  visible: boolean;
  onClose: () => void;
  riderName: string;
  email: string | null;
  phoneNumber: string | null;
  onSignOut: () => Promise<void>;
}

type IconName = React.ComponentProps<typeof Ionicons>['name'];

async function open(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open', url);
  }
}

/** Account details, support, legal links and sign-out: reachable from every signed-in screen. */
export function AccountSheet({
  visible,
  onClose,
  riderName,
  email,
  phoneNumber,
  onSignOut,
}: AccountSheetProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const confirmSignOut = (): void => {
    Alert.alert('Sign out of GhanaDash?', 'You can sign back in any time with the same account.', [
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close account menu" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]} accessibilityViewIsModal>
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <Text style={styles.sheetTitle}>Account</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Ionicons name="close" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Profile */}
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initialsOf(riderName)}</Text>
            </View>
            <View style={styles.profileText}>
              <Text style={styles.name} numberOfLines={1}>
                {riderName}
              </Text>
              <View style={styles.badge}>
                <Ionicons name="shield-checkmark" size={12} color={Colors.dispatchGreen} />
                <Text style={styles.badgeText}>GhanaDash rider</Text>
              </View>
            </View>
          </View>

          <Group>
            {email && <InfoRow icon="mail-outline" label="Email" value={email} />}
            {phoneNumber && (
              <InfoRow icon="call-outline" label="Mobile (verified)" value={formatGhanaLocal(phoneNumber)} last />
            )}
          </Group>

          <Text style={styles.groupLabel}>Help & support</Text>
          <Group>
            <LinkRow
              icon="call"
              tint={Colors.dispatchGreen}
              label="Call support"
              detail={SUPPORT.phoneDisplay}
              onPress={() => open(`tel:${SUPPORT.phoneDial}`)}
            />
            <LinkRow
              icon="mail"
              tint={Colors.harborBlue}
              label="Email support"
              detail={SUPPORT.email}
              onPress={() => open(`mailto:${SUPPORT.email}?subject=GhanaDash%20rider%20support`)}
              last
            />
          </Group>

          <Text style={styles.groupLabel}>Legal</Text>
          <Group>
            <LinkRow
              icon="lock-closed"
              tint={Colors.textSecondary}
              label="Privacy policy"
              onPress={() => open(SUPPORT.privacyUrl)}
              external
            />
            <LinkRow
              icon="document-text"
              tint={Colors.textSecondary}
              label="Terms of service"
              onPress={() => open(SUPPORT.termsUrl)}
              external
              last
            />
          </Group>

          <TouchableOpacity
            style={styles.signOut}
            onPress={confirmSignOut}
            accessibilityRole="button"
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color={Colors.dangerRed} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>

          <Text style={styles.version}>GhanaDash Rider · v{version}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Group({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <View style={styles.group}>{children}</View>;
}

function InfoRow({
  icon,
  label,
  value,
  last,
}: {
  icon: IconName;
  label: string;
  value: string;
  last?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Ionicons name={icon} size={20} color={Colors.textMuted} style={styles.rowLeadIcon} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue} selectable>
          {value}
        </Text>
      </View>
    </View>
  );
}

function LinkRow({
  icon,
  tint,
  label,
  detail,
  onPress,
  external,
  last,
}: {
  icon: IconName;
  tint: string;
  label: string;
  detail?: string;
  onPress: () => void;
  external?: boolean;
  last?: boolean;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowDivider]}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      activeOpacity={0.7}
    >
      <View style={[styles.iconTile, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail && <Text style={styles.rowDetail}>{detail}</Text>}
      </View>
      <Ionicons
        name={external ? 'open-outline' : 'chevron-forward'}
        size={18}
        color={Colors.textMuted}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceLight,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: Radii.pill,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingBottom: Spacing.md,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dispatchGreenGlow,
    borderWidth: 2,
    borderColor: Colors.dispatchGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...Typography.h2,
    color: Colors.dispatchGreenLight,
  },
  profileText: {
    flex: 1,
    gap: 6,
  },
  name: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radii.pill,
    backgroundColor: Colors.dispatchGreenGlow,
  },
  badgeText: {
    ...Typography.micro,
    color: Colors.dispatchGreen,
  },
  groupLabel: {
    ...Typography.micro,
    color: Colors.textMuted,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  group: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: TOUCH_TARGET + 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.cardBorder,
  },
  rowLeadIcon: {
    width: 24,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
  rowValue: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
    marginTop: 1,
  },
  rowTitle: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  rowDetail: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  signOut: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xxl,
    minHeight: 52,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    backgroundColor: Colors.dangerDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    ...Typography.bodyBold,
    color: Colors.dangerRed,
  },
  version: {
    ...Typography.caption,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
});
