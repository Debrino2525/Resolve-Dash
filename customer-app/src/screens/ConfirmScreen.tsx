import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError, createOrder, getQuote, uploadPackagePhoto } from '../api/backendClient';
import { DeliveryMap } from '../components/DeliveryMap';
import { InlineNotice } from '../components/InlineNotice';
import { ScreenHeader } from '../components/ScreenHeader';
import { TactileButton } from '../components/TactileButton';
import { fetchRouteLine, formatDuration } from '../services/mapbox';
import { Colors, Radii, Spacing, Typography } from '../theme/theme';
import { cedis, CustomerOrder, DeliveryDraft, PACKAGE_LABEL, Quote } from '../types/orders';
import { formatDistance } from '../utils/geo';

export interface ConfirmScreenProps {
  draft: DeliveryDraft;
  quote: Quote;
  onBack: () => void;
  onBooked: (order: CustomerOrder) => void;
}

/** Review route, price and cash payment, then request a rider. */
export function ConfirmScreen({ draft, quote: initialQuote, onBack, onBooked }: ConfirmScreenProps): React.JSX.Element {
  const [quote, setQuote] = useState(initialQuote);
  const [route, setRoute] = useState<{ latitude: number; longitude: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Uploaded once, reused if booking is retried (e.g. after a price refresh).
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stops = draft.stops ?? [];

  useEffect(() => {
    void fetchRouteLine(draft.pickup, draft.dropoff, draft.stops ?? []).then(setRoute);
  }, [draft]);

  const book = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      let q = quote;
      // Quotes are valid for 10 minutes; refresh quietly if this one has run out.
      if (new Date(q.expiresAt).getTime() - Date.now() < 15_000) {
        q = await getQuote(draft.pickup, draft.dropoff, draft.stops ?? []);
        setQuote(q);
        if (q.farePesewas !== quote.farePesewas) {
          setError(`The price was updated to ${cedis(q.farePesewas)}. Tap Request rider again to confirm.`);
          setBusy(false);
          return;
        }
      }
      let path = photoPath;
      if (draft.packagePhoto && !path) {
        path = (await uploadPackagePhoto(draft.packagePhoto)).photoPath;
        setPhotoPath(path);
      }
      onBooked(await createOrder(draft, q.quoteToken, path));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not book the delivery';
      if (err instanceof ApiError && /quote/i.test(msg)) {
        const fresh = await getQuote(draft.pickup, draft.dropoff, draft.stops ?? []).catch(() => null);
        if (fresh) setQuote(fresh);
        setError('The price needed refreshing. Check it and tap Request rider again.');
      } else {
        setError(msg);
      }
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Confirm delivery" onBack={busy ? undefined : onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.map}>
          <DeliveryMap pickup={draft.pickup} stops={stops} dropoff={draft.dropoff} route={route} showsUser={false} edgePadding={{ top: 40, bottom: 40 }} />
        </View>

        <View style={styles.card}>
          <StopRow color={Colors.dispatchGreen} icon="cube" label="Pickup" stop={draft.pickup} />
          <View style={styles.connector} />
          {stops.map((s, i) => (
            <React.Fragment key={i}>
              <StopRow color={Colors.textPrimary} number={i + 1} label={`Drop-off ${i + 1}`} stop={s} />
              <View style={styles.connector} />
            </React.Fragment>
          ))}
          <StopRow
            color={Colors.textPrimary}
            icon={stops.length ? undefined : 'flag'}
            number={stops.length ? stops.length + 1 : undefined}
            label={stops.length ? `Drop-off ${stops.length + 1} (last)` : 'Drop-off'}
            stop={draft.dropoff}
          />
          <View style={styles.meta}>
            <Meta icon="speedometer-outline" text={`${formatDistance(quote.distanceMeters)} by road`} />
            <Meta icon="time-outline" text={`~${formatDuration(quote.durationSeconds)} ride`} />
            <Meta icon="cube-outline" text={`${PACKAGE_LABEL[draft.packageType]}${draft.fragile ? ' · fragile' : ''}`} />
          </View>
          {draft.packagePhoto && (
            <Image source={{ uri: draft.packagePhoto.uri }} style={styles.packagePhoto} accessibilityLabel="Photo of the item" />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Price</Text>
          <Line label="Base fare" value={cedis(quote.baseFarePesewas)} />
          <Line label={`Distance (${formatDistance(quote.distanceMeters)})`} value={cedis(quote.distanceFarePesewas)} />
          {stops.length > 0 && (
            <Line
              label={`Extra drop-off${stops.length === 1 ? '' : 's'} (${stops.length})`}
              value={cedis(quote.stopsFarePesewas ?? 0)}
            />
          )}
          <View style={styles.divider} />
          <Line label="Total" value={cedis(quote.farePesewas)} strong />
          {quote.estimated && (
            <Text style={styles.estimate}>Road distance was estimated. The price is fixed once you book.</Text>
          )}
        </View>

        <View style={[styles.card, styles.payment]}>
          <View style={styles.payIcon}>
            <Ionicons name="cash-outline" size={22} color={Colors.dispatchGreenLight} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>Cash on delivery</Text>
            <Text style={styles.small}>
              Pay {cedis(quote.farePesewas)} to the rider when the package is delivered. Mobile Money is coming soon.
            </Text>
          </View>
          <Ionicons name="checkmark-circle" size={22} color={Colors.dispatchGreen} />
        </View>

        {error && (
          <View style={styles.errorBox}>
            <InlineNotice tone="error" text={error} />
          </View>
        )}

        <TactileButton title={`Request rider · ${cedis(quote.farePesewas)}`} onPress={() => void book()} loading={busy} />
      </ScrollView>
    </View>
  );
}

function StopRow({
  color,
  icon,
  label,
  stop,
  number,
}: {
  color: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Shown in the dot instead of an icon (numbered drop-offs). */
  number?: number;
  label: string;
  stop: DeliveryDraft['pickup'];
}): React.JSX.Element {
  return (
    <View style={styles.stop}>
      <View style={[styles.stopDot, { backgroundColor: color }]}>
        {number ? <Text style={styles.dotNumber}>{number}</Text> : <Ionicons name={icon ?? 'flag'} size={13} color="#FFFFFF" />}
      </View>
      <View style={styles.flex}>
        <Text style={styles.stopLabel}>{label}</Text>
        <Text style={styles.stopAddress}>{stop.address}</Text>
        {stop.landmark ? <Text style={styles.small}>{stop.landmark}</Text> : null}
        <Text style={styles.small}>{stop.contactName}</Text>
      </View>
    </View>
  );
}

const Meta = ({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }): React.JSX.Element => (
  <View style={styles.metaItem}>
    <Ionicons name={icon} size={15} color={Colors.textMuted} />
    <Text style={styles.small}>{text}</Text>
  </View>
);

const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }): React.JSX.Element => (
  <View style={styles.line}>
    <Text style={strong ? styles.totalLabel : styles.lineLabel}>{label}</Text>
    <Text style={strong ? styles.totalValue : styles.lineValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.huge },
  packagePhoto: { width: '100%', height: 160, borderRadius: Radii.md, marginTop: Spacing.md },
  map: { height: 200, borderRadius: Radii.lg, overflow: 'hidden', backgroundColor: Colors.cardHover },
  card: { backgroundColor: Colors.card, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg },
  cardTitle: { ...Typography.h3, color: Colors.textPrimary },
  stop: { flexDirection: 'row', gap: Spacing.md },
  stopDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  stopLabel: { ...Typography.caption, color: Colors.textMuted },
  dotNumber: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  stopAddress: { ...Typography.bodyBold, color: Colors.textPrimary },
  connector: { width: 2, height: 16, backgroundColor: Colors.cardBorder, marginLeft: 12, marginVertical: 4 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.lg },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  small: { ...Typography.caption, color: Colors.textSecondary },
  line: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  lineLabel: { ...Typography.body, color: Colors.textSecondary },
  lineValue: { ...Typography.bodyBold, color: Colors.textPrimary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.cardBorder, marginTop: Spacing.md },
  totalLabel: { ...Typography.h3, color: Colors.textPrimary },
  totalValue: { ...Typography.h2, color: Colors.textPrimary },
  estimate: { ...Typography.caption, color: Colors.amberLight, marginTop: Spacing.sm },
  payment: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderColor: Colors.dispatchGreen },
  payIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.dispatchGreenGlow, alignItems: 'center', justifyContent: 'center' },
  errorBox: { backgroundColor: Colors.dangerDark, borderColor: Colors.dangerBorder, borderWidth: 1, borderRadius: Radii.md, padding: Spacing.md },
});
