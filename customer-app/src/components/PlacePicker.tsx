import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getRecentPlaces, RecentPlace } from '../api/backendClient';
import { DEFAULT_CENTRE, getCurrentFix } from '../services/location';
import { addressForPoint, newSearchSession, resolveSuggestion, searchPlaces, Suggestion } from '../services/placeSearch';
import { Colors, Elevation, Radii, Spacing, TOUCH_TARGET, Typography } from '../theme/theme';
import { Place, Point } from '../types/orders';
import { ExactSpotMap } from './ExactSpotMap';
import { TactileButton } from './TactileButton';

export interface PlacePickerProps {
  visible: boolean;
  title: string;
  near: Point | null;
  initial: Place | null;
  /** `extras` come from a remembered place: its landmark and GPS code, to prefill the form. */
  onPick: (place: Place, extras?: { landmark: string | null; gpsCode: string | null }) => void;
  onClose: () => void;
}

/** Credit line for the data sources shown (required by OpenStreetMap and HERE). */
function attributionFor(results: Suggestion[]): string | null {
  const names: string[] = [];
  if (results.some((r) => r.source === 'osm')) names.push('© OpenStreetMap contributors');
  if (results.some((r) => r.source === 'geoapify')) names.push('© OpenStreetMap contributors, Powered by Geoapify');
  if (results.some((r) => r.source === 'here')) names.push('© HERE');
  return names.length > 0 ? `Places ${names.join(', ')}` : null;
}

/** ~250 m across: close enough to put the pin on a building or gate. */

/**
 * Choose a stop precisely. Search and GPS only get close: map search in Ghana mostly knows
 * neighbourhoods, and GPS can be off by tens of metres. So every choice ends on a zoomed-in map
 * (with satellite view) where the person moves the pin onto the exact spot and confirms it.
 */
export function PlacePicker({ visible, title, near, initial, onPick, onClose }: PlacePickerProps): React.JSX.Element {
  const [mode, setMode] = useState<'search' | 'map'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const session = useRef(newSearchSession());
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pin, setPin] = useState<Point>(initial ?? near ?? DEFAULT_CENTRE);
  const [pinAddress, setPinAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [hint, setHint] = useState<string>('');
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [recent, setRecent] = useState<RecentPlace[]>([]);
  const reqId = useRef(0);

  useEffect(() => {
    if (!visible) return;
    setMode('search');
    setQuery('');
    setResults([]);
    setPin(initial ?? near ?? DEFAULT_CENTRE);
    setPinAddress(null);
    session.current = newSearchSession();
    // Remembered spots from the customer's own deliveries (best effort: none if offline).
    getRecentPlaces()
      .then(setRecent)
      .catch(() => setRecent([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Debounced search.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const t = setTimeout(() => {
      void searchPlaces(query, near, session.current).then((r) => {
        if (id !== reqId.current) return;
        setResults(r);
        setSearching(false);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [query, near]);

  /** Every route into the map: centre on a starting point and explain what to do. */
  const openMap = (start: Point, message: string): void => {
    setPin(start);
    setPinAddress(null);
    setHint(message);
    setMode('map');
  };

  const choose = async (item: Suggestion): Promise<void> => {
    setResolvingId(item.id);
    try {
      const place = await resolveSuggestion(item, session.current);
      session.current = newSearchSession(); // a pick ends the billing session
      openMap(
        place,
        item.precise
          ? `Pin placed at ${item.title}. Check it is on the right building or entrance, and move the map if not.`
          : `${item.title} is the general area. Move the map so the pin sits on the exact building or gate.`,
      );
    } catch {
      openMap(near ?? DEFAULT_CENTRE, `We couldn't place ${item.title}. Move the map so the pin sits on the exact spot.`);
    } finally {
      setResolvingId(null);
    }
  };

  const useCurrent = async (): Promise<void> => {
    setLocating(true);
    const fix = await getCurrentFix(true);
    setLocating(false);
    if (!fix) {
      openMap(near ?? DEFAULT_CENTRE, "We couldn't get your GPS position. Move the map so the pin sits on the exact spot.");
      return;
    }
    const acc = fix.accuracy != null ? ` (accurate to about ±${fix.accuracy} m)` : '';
    openMap(fix.point, `This is your GPS position${acc}. Move the map if the pin isn't exactly on the spot.`);
  };

  const onRegionDone = (r: { latitude: number; longitude: number }): void => {
    const p = { lat: r.latitude, lng: r.longitude };
    setPin(p);
    setResolving(true);
    const id = ++reqId.current;
    void addressForPoint(p).then((a) => {
      if (id !== reqId.current) return;
      setPinAddress(a);
      setResolving(false);
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={mode === 'map' ? () => setMode('search') : onClose}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={mode === 'map' ? 'Back to search' : 'Close'}
          >
            <Ionicons name={mode === 'map' ? 'arrow-back' : 'close'} size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.iconBtn} />
        </View>

        {mode === 'search' ? (
          <View style={styles.flex}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={20} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search a place, street or area"
                placeholderTextColor={Colors.textMuted}
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCorrect={false}
                returnKeyType="search"
              />
              {searching && <ActivityIndicator color={Colors.dispatchGreenLight} />}
            </View>

            <TouchableOpacity style={styles.option} onPress={() => void useCurrent()} accessibilityRole="button">
              <View style={[styles.optionIcon, { backgroundColor: Colors.dispatchGreenGlow }]}>
                {locating ? (
                  <ActivityIndicator color={Colors.dispatchGreenLight} />
                ) : (
                  <Ionicons name="locate" size={20} color={Colors.dispatchGreenLight} />
                )}
              </View>
              <View style={styles.flex}>
                <Text style={styles.optionText}>{locating ? 'Getting a precise GPS fix…' : 'Use my current location'}</Text>
                <Text style={styles.optionSub}>Best when you are at the spot</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.option}
              onPress={() =>
                openMap(
                  initial ?? near ?? DEFAULT_CENTRE,
                  initial
                    ? 'Move the map so the pin sits exactly on the spot.'
                    : 'Move the map to the right street, then place the pin on the exact building or gate.',
                )
              }
              accessibilityRole="button"
            >
              <View style={[styles.optionIcon, { backgroundColor: Colors.harborBlueGlow }]}>
                <Ionicons name="map" size={20} color={Colors.harborBlue} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.optionText}>{initial ? 'Adjust the pin on the map' : 'Choose on the map'}</Text>
                <Text style={styles.optionSub}>Satellite view helps find the exact building</Text>
              </View>
            </TouchableOpacity>

            {query.trim().length < 2 && recent.length > 0 && (
              <View style={styles.recentBlock}>
                <Text style={styles.sectionLabel}>Your recent places</Text>
                {recent.map((r) => (
                  <TouchableOpacity
                    key={`${r.lat},${r.lng}`}
                    style={styles.result}
                    onPress={() =>
                      // Confirmed on the map in an earlier delivery: use it as is.
                      onPick({ lat: r.lat, lng: r.lng, address: r.address }, { landmark: r.landmark, gpsCode: r.gpsCode })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${r.address}`}
                  >
                    <Ionicons name="time-outline" size={20} color={Colors.dispatchGreenLight} />
                    <View style={styles.flex}>
                      <Text style={styles.resultTitle} numberOfLines={1}>
                        {r.address}
                      </Text>
                      {r.landmark ? (
                        <Text style={styles.resultSub} numberOfLines={1}>
                          {r.landmark}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <FlatList
              data={results}
              keyExtractor={(r) => r.id}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                results.length > 0 ? (
                  <Text style={styles.areaNote}>
                    {results[0]?.precise
                      ? "Pick a place, then check the pin on the map."
                      : "Search finds the area. You'll set the exact spot on the map next."}
                  </Text>
                ) : undefined
              }
              ListFooterComponent={
                attributionFor(results) ? (
                  <Text style={styles.attribution}>{attributionFor(results)}</Text>
                ) : undefined
              }
              ListEmptyComponent={
                query.trim().length >= 2 && !searching ? (
                  <Text style={styles.empty}>No matches. Try the area or town name, or choose the spot on the map.</Text>
                ) : undefined
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.result}
                  onPress={() => void choose(item)}
                  disabled={resolvingId !== null}
                  accessibilityRole="button"
                >
                  <Ionicons name="location-outline" size={20} color={Colors.textMuted} />
                  <View style={styles.flex}>
                    <Text style={styles.resultTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.subtitle ? (
                      <Text style={styles.resultSub} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {resolvingId === item.id ? (
                    <ActivityIndicator color={Colors.dispatchGreenLight} />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        ) : (
          <View style={styles.flex}>
            <ExactSpotMap
              start={pin}
              satellite={mapType === 'satellite'}
              onIdle={(p) => onRegionDone({ latitude: p.lat, longitude: p.lng })}
            />
            {/* The exact point is the dot; the pin's tip sits on it. */}
            <View pointerEvents="none" style={styles.pinWrap}>
              <Ionicons name="location" size={44} color={Colors.dangerRed} style={styles.pinIcon} />
              <View style={styles.pinDot} />
            </View>

            <View style={styles.hintBox} pointerEvents="none">
              <Text style={styles.hintText}>{hint}</Text>
            </View>

            <TouchableOpacity
              style={styles.mapTypeBtn}
              onPress={() => setMapType((t) => (t === 'standard' ? 'satellite' : 'standard'))}
              accessibilityRole="button"
              accessibilityLabel={mapType === 'standard' ? 'Show satellite view' : 'Show map view'}
            >
              <Ionicons name={mapType === 'standard' ? 'earth' : 'map-outline'} size={20} color={Colors.textPrimary} />
              <Text style={styles.mapTypeText}>{mapType === 'standard' ? 'Satellite' : 'Map'}</Text>
            </TouchableOpacity>

            <View style={styles.pinSheet}>
              <Text style={styles.pinLabel}>Pin location</Text>
              <Text style={styles.pinAddress} numberOfLines={2}>
                {resolving || !pinAddress ? 'Finding address…' : pinAddress}
              </Text>
              <TactileButton
                title="Confirm exact spot"
                onPress={() =>
                  onPick({ ...pin, address: pinAddress ?? `Pinned location (${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)})` })
                }
                disabled={resolving}
              />
              <Text style={styles.tip}>Tip: add a landmark on the next screen, e.g. "blue gate opposite the church".</Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.card },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.cardBorder,
  },
  iconBtn: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  title: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    margin: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.background,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  searchInput: { flex: 1, ...Typography.bodyBold, color: Colors.textPrimary, paddingVertical: 14 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  optionIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  optionText: { ...Typography.bodyBold, color: Colors.textPrimary },
  optionSub: { ...Typography.caption, color: Colors.textMuted },
  recentBlock: {
    paddingBottom: 4,
  },
  sectionLabel: {
    ...Typography.micro,
    textTransform: 'uppercase',
    color: Colors.textMuted,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 4,
  },
  attribution: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  areaNote: {
    ...Typography.caption,
    color: Colors.amberLight,
    backgroundColor: Colors.amberDark,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radii.sm,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.cardBorder,
  },
  resultTitle: { ...Typography.bodyBold, color: Colors.textPrimary },
  resultSub: { ...Typography.caption, color: Colors.textMuted },
  empty: { ...Typography.body, color: Colors.textSecondary, padding: Spacing.xl, textAlign: 'center' },
  pinWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // Lift the icon by its own height so its tip touches the centre dot.
  pinIcon: { marginBottom: 44 },
  pinDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dangerRed,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  hintBox: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: 110,
    backgroundColor: 'rgba(7, 9, 13, 0.82)',
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  hintText: { ...Typography.caption, color: '#FFFFFF' },
  mapTypeBtn: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.pill,
    backgroundColor: Colors.card,
    ...Elevation.floating,
  },
  mapTypeText: { ...Typography.bodyBold, color: Colors.textPrimary },
  pinSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    padding: Spacing.xl,
    gap: Spacing.sm,
    ...Elevation.sheet,
  },
  pinLabel: { ...Typography.caption, color: Colors.textMuted },
  pinAddress: { ...Typography.h3, color: Colors.textPrimary, marginBottom: Spacing.sm },
  tip: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center' },
});
