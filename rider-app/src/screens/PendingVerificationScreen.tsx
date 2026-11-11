import { Ionicons } from '@expo/vector-icons';
import { InlineNotice } from '../components/InlineNotice';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getMyDocuments } from '../api/backendClient';
import { AccountSheet } from '../components/AccountSheet';
import { DocumentUploadSheet } from '../components/DocumentUploadSheet';
import { ScreenTopBar } from '../components/ScreenTopBar';
import { TactileButton } from '../components/TactileButton';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import { DocumentChecklist, DocumentChecklistItem } from '../types/documents';
import { isoToDdMmYyyy } from '../utils/date';

export interface PendingVerificationScreenProps {
  riderName: string;
  email: string | null;
  phoneNumber: string | null;
  /** Re-reads the rider profile; moves to the dashboard once an admin approves. */
  onRefreshStatus: () => Promise<void>;
  onSignOut: () => Promise<void>;
  loading: boolean;
}

/** Leave the application for now: everything uploaded is kept for when they sign back in. */
export function confirmFinishLater(onSignOut: () => Promise<void>): void {
  Alert.alert(
    'Finish later?',
    "Your details and any documents you've uploaded are saved. Sign in again with the same number to carry on.",
    [
      { text: 'Stay', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void onSignOut() },
    ],
  );
}

const STATUS_UI: Record<
  DocumentChecklistItem['status'],
  { icon: React.ComponentProps<typeof Ionicons>['name']; text: string; color: string }
> = {
  MISSING: { icon: 'cloud-upload-outline', text: 'Tap to upload', color: Colors.amberLight },
  SUBMITTED: { icon: 'time-outline', text: 'Submitted, awaiting review', color: Colors.textSecondary },
  APPROVED: { icon: 'checkmark-circle', text: 'Approved', color: Colors.dispatchGreenLight },
  REJECTED: { icon: 'alert-circle', text: 'Needs attention, tap to fix', color: Colors.dangerRed },
};

function headline(c: DocumentChecklist): { title: string; body: string } {
  const rejected = c.items.some((i) => i.status === 'REJECTED');
  if (rejected) {
    return {
      title: 'Some documents need attention',
      body: 'Our team sent back at least one document. Open it to see what to fix, then resubmit.',
    };
  }
  if (c.submittedCount < c.requiredCount) {
    return {
      title: 'Upload your documents',
      body: `${c.submittedCount} of ${c.requiredCount} uploaded. We need all four before we can review your application.`,
    };
  }
  if (c.approvedCount < c.requiredCount) {
    return {
      title: 'Documents under review',
      body: 'Thanks! Our team is checking your documents. Pull down or tap Refresh to see updates.',
    };
  }
  return {
    title: 'Documents approved',
    body: 'All documents are approved. Your account will be activated shortly; tap Refresh to check.',
  };
}

/**
 * Shown while the rider's application is pending: real document checklist with uploads,
 * account menu (sign out, support), and status refresh.
 */
export function PendingVerificationScreen({
  riderName,
  email,
  phoneNumber,
  onRefreshStatus,
  onSignOut,
  loading,
}: PendingVerificationScreenProps): React.JSX.Element {
  const [checklist, setChecklist] = useState<DocumentChecklist | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<DocumentChecklistItem | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  const loadDocuments = useCallback(async (): Promise<void> => {
    try {
      setLoadError(null);
      setChecklist(await getMyDocuments());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your documents');
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const refreshAll = async (): Promise<void> => {
    setRefreshing(true);
    await Promise.all([loadDocuments(), onRefreshStatus()]);
    setRefreshing(false);
  };

  const head = checklist ? headline(checklist) : null;
  const progress = checklist ? checklist.submittedCount / checklist.requiredCount : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={Colors.dispatchGreen} />
        }
      >
        <ScreenTopBar title="Rider application" riderName={riderName} onOpenAccount={() => setAccountOpen(true)} />

        <View style={styles.hero}>
          <Text style={styles.welcome}>Welcome, {riderName.split(' ')[0]}</Text>
          {head ? (
            <>
              <Text style={styles.heroTitle}>{head.title}</Text>
              <Text style={styles.heroBody}>{head.body}</Text>
              <View
                style={styles.progressTrack}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: checklist?.requiredCount ?? 4, now: checklist?.submittedCount ?? 0 }}
              >
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {checklist?.submittedCount}/{checklist?.requiredCount} uploaded ·{' '}
                {checklist?.approvedCount}/{checklist?.requiredCount} approved
              </Text>
            </>
          ) : loadError ? (
            <InlineNotice tone="error" text={loadError} />
          ) : (
            <ActivityIndicator color={Colors.dispatchGreen} style={styles.loader} />
          )}
        </View>

        <Text style={styles.sectionTitle}>Required documents</Text>
        <View style={styles.list}>
          {(checklist?.items ?? []).map((item) => {
            const ui = STATUS_UI[item.status];
            const tappable = item.status !== 'APPROVED';
            return (
              <TouchableOpacity
                key={item.docType}
                style={styles.row}
                onPress={() => tappable && setEditing(item)}
                disabled={!tappable}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}: ${ui.text}`}
                activeOpacity={0.75}
              >
                <View style={[styles.rowIcon, { backgroundColor: `${ui.color}22` }]}>
                  <Ionicons name={ui.icon} size={20} color={ui.color} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{item.label}</Text>
                  <Text style={[styles.rowStatus, { color: ui.color }]}>{ui.text}</Text>
                  {item.status === 'REJECTED' && item.reviewNote && (
                    <Text style={styles.rowNote} numberOfLines={2}>
                      “{item.reviewNote}”
                    </Text>
                  )}
                  {item.expiryDate && item.status !== 'REJECTED' && (
                    <Text style={styles.rowMeta}>
                      {item.documentNumber} · expires {isoToDdMmYyyy(item.expiryDate)}
                    </Text>
                  )}
                </View>
                {tappable && <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>What happens next</Text>
        <View style={styles.steps}>
          <Step n={1} text="Upload your Ghana Card, licence, roadworthy certificate and insurance." />
          <Step n={2} text="Our team checks each document. If something is unclear we'll tell you what to fix." />
          <Step n={3} text="Once approved, your account is activated with a free trial and you can go on duty." />
        </View>

        <TactileButton
          title="Refresh status"
          variant="secondary"
          onPress={refreshAll}
          loading={loading || refreshing}
          style={styles.refresh}
        />
        <TouchableOpacity onPress={() => confirmFinishLater(onSignOut)} accessibilityRole="button" style={styles.helpLink}>
          <Text style={styles.helpText}>Finish later · Sign out</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setAccountOpen(true)} accessibilityRole="button" style={styles.helpLink}>
          <Text style={styles.helpText}>Need help? Contact support</Text>
        </TouchableOpacity>
      </ScrollView>

      <DocumentUploadSheet
        item={editing}
        onClose={() => setEditing(null)}
        onUploaded={(c) => {
          setChecklist(c);
          setEditing(null);
        }}
      />

      <AccountSheet
        visible={accountOpen}
        onClose={() => setAccountOpen(false)}
        riderName={riderName}
        email={email}
        phoneNumber={phoneNumber}
        onSignOut={onSignOut}
      />
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }): React.JSX.Element {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  hero: {
    backgroundColor: Colors.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.xl,
    marginTop: Spacing.md,
  },
  welcome: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  heroTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
  },
  heroBody: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    lineHeight: 22,
  },
  progressTrack: {
    height: 8,
    borderRadius: Radii.pill,
    backgroundColor: Colors.surfaceLight,
    marginTop: Spacing.lg,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.dispatchGreen,
    borderRadius: Radii.pill,
  },
  progressText: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
  loader: {
    marginVertical: Spacing.lg,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.dangerRed,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.micro,
    color: Colors.textMuted,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  list: {
    backgroundColor: Colors.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    minHeight: 64,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  rowStatus: {
    ...Typography.caption,
    marginTop: 2,
  },
  rowNote: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  rowMeta: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  chevron: {
    ...Typography.h2,
    color: Colors.textMuted,
  },
  steps: {
    gap: Spacing.md,
  },
  step: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.dispatchGreenGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    ...Typography.caption,
    color: Colors.dispatchGreen,
    fontWeight: '800',
  },
  stepText: {
    ...Typography.body,
    color: Colors.textSecondary,
    flex: 1,
    lineHeight: 22,
  },
  refresh: {
    marginTop: Spacing.xl,
  },
  helpLink: {
    alignSelf: 'center',
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  helpText: {
    ...Typography.caption,
    color: Colors.textMuted,
  },
});
