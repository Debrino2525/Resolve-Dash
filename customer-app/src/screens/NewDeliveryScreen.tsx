import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Image,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { getQuote } from '../api/backendClient';
import { InlineNotice } from '../components/InlineNotice';
import { PlacePicker } from '../components/PlacePicker';
import { ScreenHeader } from '../components/ScreenHeader';
import { TactileButton } from '../components/TactileButton';
import { getCurrentFix, getQuickPoint, GOOD_ACCURACY_M } from '../services/location';
import { PickedPhoto, pickPhoto } from '../services/photos';
import { reverseGeocode } from '../services/mapbox';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import {
  CustomerProfile,
  DeliveryDraft,
  PACKAGE_OPTIONS,
  PackageType,
  Place,
  Point,
  Quote,
} from '../types/orders';
import { formatGhanaLocal, toGhanaE164 } from '../utils/phone';

export interface NewDeliveryScreenProps {
  profile: CustomerProfile;
  /** Prefill (e.g. "Try again" after no rider was found). */
  initial?: DeliveryDraft | null;
  onBack: () => void;
  onQuoted: (draft: DeliveryDraft, quote: Quote) => void;
}

interface StopForm {
  place: Place | null;
  /** Shown under the address, e.g. how precise an automatic GPS pickup is. */
  note?: string;
  landmark: string;
  gpsCode: string;
  name: string;
  phone: string;
}

const GPS_RE = /^[A-Z]{2}-?\d{3,4}-?\d{3,4}$/;

const fromStop = (s: DeliveryDraft['pickup']): StopForm => ({
  place: { lat: s.lat, lng: s.lng, address: s.address },
  landmark: s.landmark ?? '',
  gpsCode: s.gpsCode ?? '',
  name: s.contactName,
  phone: formatGhanaLocal(s.contactPhone),
});

/** New delivery: pickup, drop-off, contacts and package details, then a road-distance quote. */
export function NewDeliveryScreen({ profile, initial, onBack, onQuoted }: NewDeliveryScreenProps): React.JSX.Element {
  const [pickup, setPickup] = useState<StopForm>(
    initial
      ? fromStop(initial.pickup)
      : { place: null, landmark: '', gpsCode: '', name: profile.fullName, phone: formatGhanaLocal(profile.phoneNumber) },
  );
  const [dropoff, setDropoff] = useState<StopForm>(
    initial ? fromStop(initial.dropoff) : { place: null, landmark: '', gpsCode: '', name: '', phone: '' },
  );
  const [packageType, setPackageType] = useState<PackageType>(initial?.packageType ?? 'SMALL_PARCEL');
  const [fragile, setFragile] = useState(initial?.fragile ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [photo, setPhoto] = useState<PickedPhoto | null>(initial?.packagePhoto ?? null);
  const [picking, setPicking] = useState<'pickup' | 'dropoff' | null>(null);
  const [here, setHere] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill pickup with where the customer is now (they can change it).
  useEffect(() => {
    void (async () => {
      // Centre search on the customer straight away; the precise fix replaces it below.
      void getQuickPoint().then((p) => p && setHere((cur) => cur ?? p));
      const fix = await getCurrentFix(true);
      if (fix) setHere(fix.point);
      // Only a precise fix may prefill the pickup; a rough one would send the rider to the
      // wrong place. Either way the customer can check it on the map.
      if (fix && !initial && fix.accuracy != null && fix.accuracy <= GOOD_ACCURACY_M) {
        const address = await reverseGeocode(fix.point);
        setPickup((s) =>
          s.place
            ? s
            : {
                ...s,
                place: { ...fix.point, address },
                note: `From your GPS (about ±${fix.accuracy} m). Tap to check the pin.`,
              },
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const problems = (s: StopForm, label: string): string | null => {
    if (!s.place) return `Choose the ${label} location`;
    if (s.name.trim().length < 2) return `Enter the ${label} contact's name`;
    if (!toGhanaE164(s.phone)) return `Enter a valid Ghana mobile number for the ${label} contact`;
    const gps = s.gpsCode.trim().toUpperCase();
    if (gps && !GPS_RE.test(gps)) return 'GhanaPost GPS codes look like GA-123-4567';
    return null;
  };
  const firstProblem = problems(pickup, 'pickup') ?? problems(dropoff, 'drop-off');

  const toStop = (s: StopForm): DeliveryDraft['pickup'] => ({
    lat: s.place!.lat,
    lng: s.place!.lng,
    address: s.place!.address.slice(0, 255),
    landmark: s.landmark.trim() || null,
    gpsCode: s.gpsCode.trim().toUpperCase() || null,
    contactName: s.name.trim(),
    contactPhone: toGhanaE164(s.phone)!,
  });

  const seePrice = async (): Promise<void> => {
    if (firstProblem) {
      setError(firstProblem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const draft: DeliveryDraft = {
        pickup: toStop(pickup),
        dropoff: toStop(dropoff),
        packageType,
        fragile,
        notes: notes.trim() || null,
        packagePhoto: photo,
      };
      const quote = await getQuote(draft.pickup, draft.dropoff);
      onQuoted(draft, quote);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get a price. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <ScreenHeader title="New delivery" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <StopSection
          title="Pickup"
          icon="cube"
          tone={Colors.dispatchGreen}
          form={pickup}
          onChange={setPickup}
          onPickPlace={() => setPicking('pickup')}
          contactLabel="Sender"
        />
        <StopSection
          title="Drop-off"
          icon="flag"
          tone={Colors.textPrimary}
          form={dropoff}
          onChange={setDropoff}
          onPickPlace={() => setPicking('dropoff')}
          contactLabel="Receiver"
          onUseMe={() => setDropoff((s) => ({ ...s, name: profile.fullName, phone: formatGhanaLocal(profile.phoneNumber) }))}
        />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What are you sending?</Text>
          <View style={styles.packages}>
            {PACKAGE_OPTIONS.map((p) => {
              const on = p.type === packageType;
              return (
                <TouchableOpacity
                  key={p.type}
                  style={[styles.package, on && styles.packageOn]}
                  onPress={() => setPackageType(p.type)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <MaterialCommunityIcons
                    name={p.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                    size={26}
                    color={on ? Colors.dispatchGreenLight : Colors.textSecondary}
                  />
                  <Text style={[styles.packageLabel, on && { color: Colors.dispatchGreenLight }]}>{p.label}</Text>
                  <Text style={styles.packageHint}>{p.hint}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.label, styles.photoLabel]}>Photo of the item (optional)</Text>
          {photo ? (
            <View style={styles.photoRow}>
              <Image source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel="Photo of the item" />
              <View style={styles.flex}>
                <Text style={styles.switchHint}>The rider sees this before accepting.</Text>
                <TouchableOpacity onPress={() => setPhoto(null)} accessibilityRole="button">
                  <Text style={styles.removeLink}>Remove photo</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.photoButtons}>
              <TouchableOpacity
                style={styles.photoBtn}
                onPress={() => void pickPhoto('camera').then((p) => p && setPhoto(p))}
                accessibilityRole="button"
              >
                <Ionicons name="camera-outline" size={20} color={Colors.dispatchGreenLight} />
                <Text style={styles.photoBtnText}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.photoBtn}
                onPress={() => void pickPhoto('library').then((p) => p && setPhoto(p))}
                accessibilityRole="button"
              >
                <Ionicons name="image-outline" size={20} color={Colors.dispatchGreenLight} />
                <Text style={styles.photoBtnText}>From gallery</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.switchLabel}>Fragile</Text>
              <Text style={styles.switchHint}>We'll ask the rider to handle it with care</Text>
            </View>
            <Switch
              value={fragile}
              onValueChange={setFragile}
              trackColor={{ true: Colors.dispatchGreen, false: Colors.cardBorder }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text style={styles.label}>Note for the rider (optional)</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            placeholder="e.g. Call when you reach the gate"
            placeholderTextColor={Colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            maxLength={500}
            multiline
          />
        </View>

        {error && (
          <View style={styles.errorBox}>
            <InlineNotice tone="error" text={error} />
          </View>
        )}

        <TactileButton title="See price" onPress={() => void seePrice()} loading={busy} disabled={busy} />
        <Text style={styles.footnote}>No payment now. You pay the rider in cash when the package is delivered.</Text>
      </ScrollView>

      <PlacePicker
        visible={picking !== null}
        title={picking === 'pickup' ? 'Pickup location' : 'Drop-off location'}
        near={here}
        initial={(picking === 'pickup' ? pickup.place : dropoff.place) ?? null}
        onClose={() => setPicking(null)}
        onPick={(place, extras) => {
          const note = extras ? 'Your saved spot from an earlier delivery.' : 'Exact spot confirmed on the map.';
          // A remembered place brings its landmark and GPS code, without overwriting what was typed.
          const apply = (s: StopForm): StopForm => ({
            ...s,
            place,
            note,
            landmark: s.landmark.trim() || extras?.landmark || '',
            gpsCode: s.gpsCode.trim() || extras?.gpsCode || '',
          });
          if (picking === 'pickup') setPickup(apply);
          else setDropoff(apply);
          setPicking(null);
          setError(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function StopSection({
  title,
  icon,
  tone,
  form,
  onChange,
  onPickPlace,
  contactLabel,
  onUseMe,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: string;
  form: StopForm;
  onChange: (f: StopForm) => void;
  onPickPlace: () => void;
  contactLabel: string;
  onUseMe?: () => void;
}): React.JSX.Element {
  const set = (patch: Partial<StopForm>): void => onChange({ ...form, ...patch });
  return (
    <View style={styles.card}>
      <View style={styles.stopHeader}>
        <View style={[styles.stopDot, { backgroundColor: tone }]}>
          <Ionicons name={icon} size={14} color="#FFFFFF" />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>

      <TouchableOpacity style={styles.placeBtn} onPress={onPickPlace} accessibilityRole="button">
        <Ionicons name="location-outline" size={20} color={form.place ? Colors.textPrimary : Colors.textMuted} />
        <View style={styles.flex}>
          <Text style={[styles.placeText, !form.place && { color: Colors.textMuted }]} numberOfLines={2}>
            {form.place?.address ?? `Choose ${title.toLowerCase()} location`}
          </Text>
          {form.place && form.note ? <Text style={styles.placeNote}>{form.note}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      <Text style={styles.label}>Landmark (helps the rider find it)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Opposite the Shell filling station"
        placeholderTextColor={Colors.textMuted}
        value={form.landmark}
        onChangeText={(landmark) => set({ landmark })}
        maxLength={255}
      />
      <Text style={styles.label}>GhanaPost GPS address (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="GA-123-4567"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        value={form.gpsCode}
        onChangeText={(gpsCode) => set({ gpsCode })}
        maxLength={14}
      />

      <View style={styles.contactHeader}>
        <Text style={styles.label}>{contactLabel}</Text>
        {onUseMe && (
          <TouchableOpacity onPress={onUseMe} accessibilityRole="button">
            <Text style={styles.link}>It's me</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.flex]}
          placeholder="Name"
          placeholderTextColor={Colors.textMuted}
          value={form.name}
          onChangeText={(name) => set({ name })}
          autoCapitalize="words"
          maxLength={100}
        />
        <TextInput
          style={[styles.input, styles.flex]}
          placeholder="024 123 4567"
          placeholderTextColor={Colors.textMuted}
          value={form.phone}
          onChangeText={(phone) => set({ phone })}
          keyboardType="phone-pad"
          maxLength={16}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.huge },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.lg,
  },
  cardTitle: { ...Typography.h3, color: Colors.textPrimary },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  stopDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  placeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: Spacing.md,
    minHeight: 52,
    marginBottom: Spacing.md,
  },
  placeNote: { ...Typography.caption, color: Colors.textMuted, marginTop: 2 },
  placeText: { ...Typography.bodyBold, color: Colors.textPrimary, flex: 1 },
  label: { ...Typography.micro, color: Colors.textMuted, marginBottom: Spacing.xs },
  input: {
    backgroundColor: Colors.background,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom: Spacing.md,
    ...Typography.body,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: Spacing.sm },
  contactHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { ...Typography.caption, color: Colors.dispatchGreenLight, fontWeight: '700', paddingVertical: Spacing.xs },
  packages: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  package: {
    width: '48%',
    flexGrow: 1,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    padding: Spacing.md,
    gap: 2,
  },
  packageOn: { borderColor: Colors.dispatchGreen, backgroundColor: Colors.dispatchGreenGlow },
  packageLabel: { ...Typography.bodyBold, color: Colors.textPrimary, marginTop: Spacing.xs },
  packageHint: { ...Typography.caption, color: Colors.textMuted },
  photoLabel: { marginTop: Spacing.lg },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  photo: { width: 88, height: 88, borderRadius: Radii.md, backgroundColor: Colors.surfaceLight },
  removeLink: { ...Typography.caption, color: Colors.dangerRed, fontWeight: '700', paddingVertical: Spacing.sm },
  photoButtons: { flexDirection: 'row', gap: Spacing.sm },
  photoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    borderStyle: 'dashed',
  },
  photoBtnText: { ...Typography.bodyBold, color: Colors.dispatchGreenLight },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginVertical: Spacing.lg },
  switchLabel: { ...Typography.bodyBold, color: Colors.textPrimary },
  switchHint: { ...Typography.caption, color: Colors.textMuted },
  errorBox: {
    backgroundColor: Colors.dangerDark,
    borderColor: Colors.dangerBorder,
    borderWidth: 1,
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  footnote: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center' },
});
