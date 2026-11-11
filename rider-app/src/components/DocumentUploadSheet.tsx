import { Ionicons } from '@expo/vector-icons';
import { InlineNotice } from './InlineNotice';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { uploadDocument } from '../api/backendClient';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import { DocumentChecklist, DocumentChecklistItem, PickedFile } from '../types/documents';
import { ddMmYyyyToIso, isoToDdMmYyyy, isPastIsoDate, maskDdMmYyyy } from '../utils/date';
import { TactileButton } from './TactileButton';

export interface DocumentUploadSheetProps {
  item: DocumentChecklistItem | null;
  onClose: () => void;
  onUploaded: (checklist: DocumentChecklist) => void;
}

const GHANA_CARD = /^GHA-\d{9}-\d$/;

function mimeFromUri(uri: string): string {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function toPickedFile(asset: ImagePicker.ImagePickerAsset, docType: string): PickedFile {
  const mimeType = asset.mimeType && asset.mimeType !== 'image/heic' ? asset.mimeType : mimeFromUri(asset.uri);
  const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
  return { uri: asset.uri, mimeType, fileName: `${docType.toLowerCase()}.${ext}` };
}

/** Full-screen sheet to submit (or resubmit) one compliance document. */
export function DocumentUploadSheet({
  item,
  onClose,
  onUploaded,
}: DocumentUploadSheetProps): React.JSX.Element {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time a document is opened (prefill with what was sent before).
  useEffect(() => {
    if (!item) return;
    setNumber(item.documentNumber ?? '');
    setExpiry(isoToDdMmYyyy(item.expiryDate));
    setFile(null);
    setError(null);
    setBusy(false);
  }, [item]);

  if (!item) return <></>;

  const isGhanaCard = item.docType === 'GHANA_CARD';
  /** The profile photo: a selfie with the front camera only (no number, no expiry, no gallery). */
  const isSelfie = item.docType === 'PROFILE_PHOTO';

  const pick = async (source: 'camera' | 'library'): Promise<void> => {
    setError(null);
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        source === 'camera'
          ? 'Allow camera access in your phone settings to photograph the document.'
          : 'Allow photo access in your phone settings to choose the document photo.',
      );
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.6, // keeps uploads small (well under 5 MB) and converts HEIC to JPEG on iOS
      exif: false,
      // Selfie: front camera, square crop so it fits the round avatar.
      allowsEditing: isSelfie,
      ...(isSelfie ? { aspect: [1, 1] as [number, number], cameraType: ImagePicker.CameraType.front } : {}),
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled && result.assets[0]) {
      setFile(toPickedFile(result.assets[0], item.docType));
    }
  };

  const submit = async (): Promise<void> => {
    if (isSelfie) {
      if (!file) return setError('Take a selfie: a clear photo of your face.');
      setBusy(true);
      setError(null);
      try {
        onUploaded(await uploadDocument(item.docType, { documentNumber: '', expiryDate: '' }, file));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
        setBusy(false);
      }
      return;
    }
    const docNumber = number.trim().toUpperCase();
    if (docNumber.length < 3) return setError(`Enter the number. ${item.numberHint}.`);
    if (isGhanaCard && !GHANA_CARD.test(docNumber)) {
      return setError('Ghana Card number should look like GHA-123456789-0.');
    }
    const iso = ddMmYyyyToIso(expiry);
    if (item.expiryRequired && !iso) return setError('Enter the expiry date as DD/MM/YYYY.');
    if (iso && isPastIsoDate(iso)) return setError('This document has expired. Upload a current one.');
    if (!file) return setError('Add a clear photo of the document.');

    setBusy(true);
    setError(null);
    try {
      const checklist = await uploadDocument(
        item.docType,
        { documentNumber: docNumber, expiryDate: iso ?? '' },
        file,
      );
      onUploaded(checklist);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={busy} accessibilityRole="button" style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {item.label}
          </Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {item.status === 'REJECTED' && item.reviewNote && (
            <View style={styles.rejectBox}>
              <Text style={styles.rejectTitle}>Sent back by our team</Text>
              <Text style={styles.rejectText}>{item.reviewNote}</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorBox} accessibilityLiveRegion="polite">
              <InlineNotice tone="error" text={error} />
            </View>
          )}

          {!isSelfie && (
          <>
          <Text style={styles.label}>{isGhanaCard ? 'Ghana Card number' : 'Document number'}</Text>
          <TextInput
            style={styles.input}
            value={number}
            onChangeText={setNumber}
            placeholder={isGhanaCard ? 'GHA-123456789-0' : 'As printed on the document'}
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={60}
          />
          <Text style={styles.hint}>{item.numberHint}</Text>

          <Text style={styles.label}>Expiry date</Text>
          <TextInput
            style={styles.input}
            value={expiry}
            onChangeText={(v) => setExpiry(maskDdMmYyyy(v))}
            placeholder="DD/MM/YYYY"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
            maxLength={10}
          />
          </>
          )}

          <Text style={styles.label}>{isSelfie ? 'Your photo' : 'Photo of the document'}</Text>
          <View style={[styles.preview, isSelfie && styles.selfiePreview]}>
            {file ? (
              <Image
                source={{ uri: file.uri }}
                style={styles.previewImage}
                resizeMode={isSelfie ? 'cover' : 'contain'}
                accessibilityLabel={`${item.label} photo`}
              />
            ) : (
              <Text style={styles.previewHint}>
                {isSelfie
                  ? 'Face the camera in good light. No helmet, hat or sunglasses. Customers see this photo so they know who is coming, and our team checks it against your Ghana Card.'
                  : 'Lay the document flat in good light. Make sure every corner and all text is readable.'}
              </Text>
            )}
          </View>
          <View style={styles.pickRow}>
            <TouchableOpacity style={styles.pickBtn} onPress={() => pick('camera')} disabled={busy} accessibilityRole="button">
              <Ionicons name="camera-outline" size={20} color={Colors.textPrimary} />
              <Text style={styles.pickText}>{file ? 'Retake' : isSelfie ? 'Take selfie' : 'Take photo'}</Text>
            </TouchableOpacity>
            {!isSelfie && (
              <TouchableOpacity style={styles.pickBtn} onPress={() => pick('library')} disabled={busy} accessibilityRole="button">
                <Ionicons name="images-outline" size={20} color={Colors.textPrimary} />
                <Text style={styles.pickText}>Choose photo</Text>
              </TouchableOpacity>
            )}
          </View>

          <TactileButton
            title={item.status === 'MISSING' ? 'Submit for review' : 'Resubmit for review'}
            variant="primary"
            onPress={submit}
            loading={busy}
            disabled={busy}
            style={styles.submit}
          />
          <Text style={styles.privacy}>
            {isSelfie
              ? 'Stored privately. Our verification team sees it, and once approved, customers see it only during a delivery with you.'
              : 'Only GhanaDash verification staff can see your documents. They are stored privately and used only to verify you.'}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  headerBtn: {
    minWidth: 64,
    paddingVertical: Spacing.sm,
  },
  headerBtnText: {
    ...Typography.bodyBold,
    color: Colors.dispatchGreen,
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xxxl * 2,
  },
  rejectBox: {
    backgroundColor: Colors.dangerDark,
    borderColor: Colors.dangerBorder,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  rejectTitle: {
    ...Typography.micro,
    color: Colors.dangerRed,
    marginBottom: 4,
  },
  rejectText: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  errorBox: {
    backgroundColor: Colors.dangerDark,
    borderColor: Colors.dangerBorder,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.dangerRed,
  },
  label: {
    ...Typography.micro,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    marginBottom: Spacing.xs,
    ...Typography.bodyBold,
  },
  hint: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginBottom: Spacing.lg,
  },
  preview: {
    height: 220,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  selfiePreview: {
    width: 220,
    height: 220,
    borderRadius: 110,
    alignSelf: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewHint: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    padding: Spacing.xl,
    lineHeight: 18,
  },
  pickRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  pickBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.cardHover,
  },
  pickText: {
    ...Typography.bodyBold,
    color: Colors.textPrimary,
  },
  submit: {
    marginTop: Spacing.xl,
  },
  privacy: {
    ...Typography.caption,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
    lineHeight: 18,
  },
});
