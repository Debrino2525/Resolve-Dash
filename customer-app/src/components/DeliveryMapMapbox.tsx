import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Camera, LineLayer, LocationPuck, MapView, MarkerView, ShapeSource, StyleImport } from '@rnmapbox/maps';
import React, { useEffect, useRef } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { DEFAULT_CENTRE } from '../services/location';
import { Colors } from '../theme/theme';
import { Point } from '../types/orders';
import { CLEAN_BASEMAP, lngLat, STANDARD_STYLE, zoomForDelta } from './mapSetup';

export interface DeliveryMapProps {
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

/** Mapbox map with pickup (green), drop-off (ink flag), rider (bike) and nearby rider dots. */
export function DeliveryMapMapbox({
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
  const camera = useRef<Camera>(null);
  const focus = [pickup, ...stops.filter((s) => !s.done), dropoff, rider].filter((p): p is Point => Boolean(p));
  const fitKey = focus.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  const start = center ?? pickup ?? DEFAULT_CENTRE;

  useEffect(() => {
    if (!camera.current) return;
    if (focus.length >= 2) {
      const lats = focus.map((p) => p.lat);
      const lngs = focus.map((p) => p.lng);
      camera.current.fitBounds(
        [Math.max(...lngs), Math.max(...lats)],
        [Math.min(...lngs), Math.min(...lats)],
        [edgePadding.top, 56, edgePadding.bottom, 56],
        700,
      );
    } else if (focus.length === 1 || center) {
      const p = focus[0] ?? center!;
      camera.current.setCamera({ centerCoordinate: lngLat(p), zoomLevel: zoomForDelta(0.025), animationDuration: 400 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, center?.lat, center?.lng, edgePadding.bottom]);

  const routeShape =
    route && route.length > 1
      ? {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: route.map((c) => [c.longitude, c.latitude]) },
        }
      : null;

  return (
    <MapView
      style={[StyleSheet.absoluteFill, style]}
      styleURL={STANDARD_STYLE}
      logoEnabled
      attributionEnabled
      attributionPosition={{ bottom: 8, right: 8 }}
      logoPosition={{ bottom: 8, left: 8 }}
      scaleBarEnabled={false}
      compassEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
    >
      <StyleImport id="basemap" existing config={CLEAN_BASEMAP} />
      <Camera ref={camera} defaultSettings={{ centerCoordinate: lngLat(start), zoomLevel: zoomForDelta(0.04) }} />
      {showsUser && <LocationPuck puckBearingEnabled={false} />}
      {routeShape && (
        <ShapeSource id="route" shape={routeShape}>
          <LineLayer id="routeLine" style={{ lineColor: Colors.roadRoute, lineWidth: 5, lineCap: 'round', lineJoin: 'round' }} />
        </ShapeSource>
      )}
      {nearby.map((r, i) => (
        <MarkerView key={`n${i}`} coordinate={lngLat(r)} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <View style={styles.nearby}>
            <MaterialCommunityIcons name="moped" size={14} color={Colors.textInverse} />
          </View>
        </MarkerView>
      ))}
      {pickup && (
        <MarkerView coordinate={lngLat(pickup)} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <View style={[styles.stop, { backgroundColor: Colors.dispatchGreen }]} accessibilityLabel="Pickup">
            <Ionicons name="cube" size={14} color={Colors.onBrand} />
          </View>
        </MarkerView>
      )}
      {stops.map((s, i) => (
        <MarkerView key={`s${i}`} coordinate={lngLat(s)} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <View
            style={[styles.stop, styles.numbered, s.done && styles.done]}
            accessibilityLabel={`Drop-off ${i + 1}${s.done ? ', done' : ''}`}
          >
            <Text style={styles.number}>{i + 1}</Text>
          </View>
        </MarkerView>
      ))}
      {dropoff && (
        <MarkerView coordinate={lngLat(dropoff)} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <View style={[styles.stop, { backgroundColor: Colors.textPrimary }]} accessibilityLabel="Drop-off">
            <Ionicons name="flag" size={14} color={Colors.textInverse} />
          </View>
        </MarkerView>
      )}
      {rider && (
        <MarkerView coordinate={lngLat(rider)} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
          <View style={styles.rider} accessibilityLabel="Your rider">
            <MaterialCommunityIcons name="moped" size={20} color={Colors.onBrand} />
          </View>
        </MarkerView>
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
