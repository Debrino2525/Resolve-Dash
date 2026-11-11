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
import MapView from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCurrentPoint, ACCRA } from '../services/location';
import { PlaceSuggestion, reverseGeocode, searchPlaces } from '../services/mapbox';
import { Colors, Elevation, Radii, Spacing, TOUCH_TARGET, Typography } from '../theme/theme';
import { Place, Point } from '../types/orders';
import { TactileButton } from './TactileButton';

export interface PlacePickerProps {
  visible: boolean;
  title: string;
  near: Point | null;
  initial: Place | null;
  onPick: (place: Place) => void;
  onClose: () => void;
}

/**
 * Choose a stop: search an address/area, use the current location, or drop a pin on the map.
 * Ghanaian addresses are often informal, so pinning on the map plus a landmark note (on the
 * form) is a first-class option, not a fallback.
 */
export function PlacePicker({ visible, title, near, initial, onPick, onClose }: PlacePickerProps): React.JSX.Element {
  const [mode, setMode] = useState<'search' | 'map'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pin, setPin] = useState<Point>(initial ?? near ?? ACCRA);
  const [pinAddress, setPinAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!visible) return;
    setMode('search');
    setQuery('');
    setResults([]);
    setPin(initial ?? near ?? ACCRA);
    setPinAddress(null);
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
      void searchPlaces(query, near).then((r) => {
        if (id !== reqId.current) return;
        setResults(r);
        setSearching(false);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [query, near]);

  const useCurrent = async (): Promise<void> => {
    setLocating(true);
    const p = await getCurrentPoint(true);
    if (!p) {
      setLocating(false);
      setMode('map');
      return;
    }
    const address = await reverseGeocode(p);
    setLocating(false);
    onPick({ ...p, address });
  };

  const onRegionDone = (r: { latitude: number; longitude: number }): void => {
    const p = { lat: r.latitude, lng: r.longitude };
    setPin(p);
    setResolving(true);
    const id = ++reqId.current;
    void reverseGeocode(p).then((a) => {
      if (id !== reqId.current) return;
      setPinAddress(a);
      setResolving(false);
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
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
                placeholder="Search street, area or place"
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
              <Text style={styles.optionText}>Use my current location</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.option} onPress={() => setMode('map')} accessibilityRole="button">
              <View style={[styles.optionIcon, { backgroundColor: Colors.harborBlueGlow }]}>
                <Ionicons name="map" size={20} color={Colors.harborBlue} />
              </View>
              <Text style={styles.optionText}>Choose on the map</Text>
            </TouchableOpacity>

            <FlatList
              data={results}
              keyExtractor={(r) => r.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                query.trim().length >= 2 && !searching ? (
                  <Text style={styles.empty}>
                    No matches. Try a nearby street or area, or choose the spot on the map.
                  </Text>
                ) : undefined
              }
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.result} onPress={() => onPick(item)} accessibilityRole="button">
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
                </TouchableOpacity>
              )}
            />
          </View>
        ) : (
          <View style={styles.flex}>
            <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={{ latitude: pin.lat, longitude: pin.lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
              onRegionChangeComplete={onRegionDone}
              showsUserLocation
              rotateEnabled={false}
              pitchEnabled={false}
              toolbarEnabled={false}
            />
            <View pointerEvents="none" style={styles.pinWrap}>
              <Ionicons name="location" size={44} color={Colors.dispatchGreen} style={styles.pinIcon} />
            </View>
            <View style={styles.pinSheet}>
              <Text style={styles.pinLabel}>Move the map to place the pin</Text>
              <Text style={styles.pinAddress} numberOfLines={2}>
                {resolving || !pinAddress ? 'Finding address…' : pinAddress}
              </Text>
              <TactileButton
                title="Confirm this spot"
                onPress={() => onPick({ ...pin, address: pinAddress ?? `Pinned location (${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)})` })}
                disabled={resolving}
              />
              <TouchableOpacity onPress={() => setMode('search')} style={styles.linkBtn} accessibilityRole="button">
                <Text style={styles.link}>Search instead</Text>
              </TouchableOpacity>
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
  pinIcon: { marginBottom: 44 },
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
  linkBtn: { alignSelf: 'center', padding: Spacing.sm },
  link: { ...Typography.bodyBold, color: Colors.dispatchGreenLight },
});
