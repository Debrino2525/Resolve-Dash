import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { CLEAN_MAP } from './mapStyle';
import { DEFAULT_CENTRE } from '../services/location';
import { Colors } from '../theme/theme';
import { Point } from '../types/orders';

interface DeliveryMapProps {
  pickup?: Point | null;
  dropoff?: Point | null;
  /** Drop-offs before the final one, numbered 1, 2, 3 (done ones fade). */
  stops?: (Point & { done?: boolean })[];
  rider?: (Point & { heading?: number | null }) | null;
  /** Approximate positions of nearby online riders (Home screen). */
  nearby?: Point[];
  /** Where to centre when there are no stops (e.g. the customer). */
  center?: Point | null;
  route?: { latitude: number; longitude: number }[] | null;
  /** Extra space hidden under sheets, so fitted points stay visible. */
  edgePadding?: { top: number; bottom: number };
  style?: StyleProp<ViewStyle>;
  showsUser?: boolean;
}

const ll = (p: Point): { latitude: number; longitude: number } => ({ latitude: p.lat, longitude: p.lng });

/** Expo Go only (no Mapbox SDK there): light map with pickup (green), drop-off (ink flag), rider (bike) and nearby rider dots. */
export function DeliveryMapExpoGo({
  pickup,
  dropoff,
  stops = [],
  rider,
  nearby = [],
  center,
  route,
  edgePadding = { top: 80, bottom: 320 },
  style,
  showsUser = true,
}: DeliveryMapProps): React.JSX.Element {
  const map = useRef<MapView>(null);
  const focus = [pickup, ...stops.filter((s) => !s.done), dropoff, rider].filter((p): p is Point => Boolean(p));
  const fitKey = focus.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  const start = center ?? pickup ?? DEFAULT_CENTRE;

  useEffect(() => {
    if (!map.current) return;
    if (focus.length >= 2) {
      map.current.fitToCoordinates(focus.map(ll), {
        edgePadding: { top: edgePadding.top, bottom: edgePadding.bottom, left: 56, right: 56 },
        animated: true,
      });
    } else if (focus.length === 1 || center) {
      const p = focus[0] ?? center!;
      map.current.animateToRegion({ ...ll(p), latitudeDelta: 0.025, longitudeDelta: 0.025 }, 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, center?.lat, center?.lng, edgePadding.bottom]);

  return (
    <MapView
      ref={map}
      style={[StyleSheet.absoluteFill, style]}
      initialRegion={{ ...ll(start), latitudeDelta: 0.04, longitudeDelta: 0.04 }}
      showsUserLocation={showsUser}
      showsMyLocationButton={false}
      showsPointsOfInterests={false}
      showsBuildings={false}
      showsTraffic={false}
      showsIndoors={false}
      customMapStyle={CLEAN_MAP}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
    >
      {route && route.length > 1 && (
        <Polyline coordinates={route} strokeColor={Colors.roadRoute} strokeWidth={5} lineCap="round" />
      )}
      {nearby.map((r, i) => (
        <Marker key={`n${i}`} coordinate={ll(r)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.nearby}>
            <MaterialCommunityIcons name="moped" size={14} color={Colors.textInverse} />
          </View>
        </Marker>
      ))}
      {pickup && (
        <Marker coordinate={ll(pickup)} anchor={{ x: 0.5, y: 0.5 }} title="Pickup">
          <View style={[styles.stop, { backgroundColor: Colors.dispatchGreen }]}>
            <Ionicons name="cube" size={14} color={Colors.onBrand} />
          </View>
        </Marker>
      )}
      {stops.map((s, i) => (
        <Marker key={`s${i}`} coordinate={ll(s)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View
            style={[styles.stop, styles.numbered, s.done && styles.done]}
            accessibilityLabel={`Drop-off ${i + 1}${s.done ? ', done' : ''}`}
          >
            <Text style={styles.number}>{i + 1}</Text>
          </View>
        </Marker>
      ))}
      {dropoff && (
        <Marker coordinate={ll(dropoff)} anchor={{ x: 0.5, y: 0.5 }} title="Drop-off">
          <View style={[styles.stop, { backgroundColor: Colors.textPrimary }]}>
            <Ionicons name="flag" size={14} color={Colors.textInverse} />
          </View>
        </Marker>
      )}
      {rider && (
        <Marker coordinate={ll(rider)} anchor={{ x: 0.5, y: 0.5 }} title="Your rider">
          <View style={styles.rider}>
            <MaterialCommunityIcons name="moped" size={20} color={Colors.onBrand} />
          </View>
        </Marker>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  numbered: { backgroundColor: Colors.textPrimary },
  done: { opacity: 0.45 },
  number: { color: Colors.textInverse, fontSize: 13, fontWeight: '800' },
  stop: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rider: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: Colors.dispatchGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearby: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: Colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
