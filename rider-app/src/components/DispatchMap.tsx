import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region, UrlTile } from 'react-native-maps';
import { GHANA_DEFAULT_CENTER, LatLng } from '../services/location';
import { mapboxTileUrl } from '../services/routing';
import { Colors, Elevation, Radii, TOUCH_TARGET } from '../theme/theme';
import { regionForPoints } from '../utils/geo';

export interface DispatchMapProps {
  rider: LatLng | null;
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
  /** Road geometry for the current job; falls back to straight segments when absent. */
  route?: LatLng[] | null;
  /** Keep the camera on the rider (on duty, no active job). */
  follow: boolean;
  /** Visible height of the bottom sheet, so the camera centres above it. */
  bottomInset: number;
  topInset: number;
  /** Called when the rider touches or drags the map (used to collapse the sheet). */
  onMapTouch?: () => void;
  /** Turn-by-turn camera: follows the rider, rotated to the direction of travel and tilted. */
  navigationCamera?: { center: LatLng; heading: number } | null;
}

/** Fallback dark style for Google Maps when no Mapbox token is configured (Android). */
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0f141c' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a96a8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0b0f15' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1d2532' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a3446' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#08131f' }] },
];

const RIDER_ZOOM = { latitudeDelta: 0.012, longitudeDelta: 0.012 };

/**
 * Turn-by-turn chase camera. Google Maps (Android) uses `zoom`; Apple Maps (iOS) ignores zoom
 * and needs `altitude` (metres above the ground) instead, so both are set.
 */
function navCamera(c: { center: LatLng; heading: number }) {
  return { center: c.center, heading: c.heading, pitch: 45, zoom: 17.5, altitude: 320 };
}
const TILE_URL = mapboxTileUrl();

export function DispatchMap({
  rider,
  pickup,
  dropoff,
  route,
  follow,
  bottomInset,
  topInset,
  onMapTouch,
  navigationCamera,
}: DispatchMapProps): React.JSX.Element {
  const map = useRef<MapView>(null);
  const centre = rider ?? GHANA_DEFAULT_CENTER;
  const stops = [rider, pickup, dropoff].filter((p): p is LatLng => Boolean(p));
  const line = route && route.length >= 2 ? route : stops;

  const navigating = Boolean(navigationCamera);

  // Turn-by-turn: chase camera on every position update.
  useEffect(() => {
    if (!navigationCamera) return;
    map.current?.animateCamera(navCamera(navigationCamera), { duration: 900 });
  }, [navigationCamera]);

  // Leaving navigation: back to a flat, north-up view of the job.
  useEffect(() => {
    if (navigating) return;
    map.current?.animateCamera({ heading: 0, pitch: 0 }, { duration: 400 });
  }, [navigating]);

  // Frame the whole job when it appears or its route arrives.
  useEffect(() => {
    if (navigating) return;
    const pts = route && route.length >= 2 ? route : stops;
    if (pickup && pts.length >= 2) {
      map.current?.animateToRegion(regionForPoints(pts, 1.35), 600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.latitude, dropoff?.latitude, route?.length]);

  // Follow the rider while idle on duty.
  useEffect(() => {
    if (follow && rider && !pickup) {
      map.current?.animateToRegion({ ...rider, ...RIDER_ZOOM }, 500);
    }
  }, [follow, rider, pickup]);

  const recenter = (): void => {
    if (navigationCamera) {
      map.current?.animateCamera(navCamera(navigationCamera), { duration: 500 });
      return;
    }
    const region: Region =
      line.length >= 2 ? regionForPoints(line, 1.35) : { ...centre, ...RIDER_ZOOM };
    map.current?.animateToRegion(region, 500);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        // With Mapbox tiles, hide the native base map so both platforms look identical.
        mapType={
          TILE_URL && Platform.OS === 'android'
            ? 'none'
            : Platform.OS === 'ios'
              ? 'mutedStandard'
              : 'standard'
        }
        customMapStyle={!TILE_URL && Platform.OS === 'android' ? DARK_MAP_STYLE : undefined}
        userInterfaceStyle="dark"
        initialRegion={{
          ...centre,
          latitudeDelta: rider ? RIDER_ZOOM.latitudeDelta : 0.25,
          longitudeDelta: rider ? RIDER_ZOOM.longitudeDelta : 0.25,
        }}
        showsUserLocation={Boolean(rider)}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterests={!TILE_URL}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        mapPadding={{ top: topInset, bottom: bottomInset, left: 0, right: 0 }}
        onPress={onMapTouch}
        onPanDrag={onMapTouch}
        accessibilityLabel="Map showing your position and current delivery"
      >
        {TILE_URL && (
          <UrlTile
            urlTemplate={TILE_URL}
            maximumZ={20}
            tileSize={256}
            shouldReplaceMapContent
            zIndex={-1}
          />
        )}

        {line.length >= 2 && (
          <Polyline
            coordinates={line}
            strokeColor={Colors.roadRoute}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            lineDashPattern={route && route.length >= 2 ? undefined : [8, 6]}
          />
        )}

        {pickup && (
          <Marker
            coordinate={pickup}
            anchor={{ x: 0.5, y: 0.5 }}
            identifier="pickup"
            title="Pickup"
          >
            <View style={[styles.pin, { backgroundColor: Colors.dispatchGreen }]}>
              <Ionicons name="cube" size={16} color={Colors.onBrand} />
            </View>
          </Marker>
        )}
        {dropoff && (
          <Marker
            coordinate={dropoff}
            anchor={{ x: 0.5, y: 0.5 }}
            identifier="dropoff"
            title="Drop-off"
          >
            <View style={[styles.pin, { backgroundColor: Colors.harborBlue }]}>
              <Ionicons name="flag" size={16} color="#FFFFFF" />
            </View>
          </Marker>
        )}
      </MapView>

      <TouchableOpacity
        onPress={recenter}
        style={[styles.recenter, { bottom: bottomInset + 14 }]}
        accessibilityRole="button"
        accessibilityLabel="Recenter map"
        activeOpacity={0.85}
      >
        <Ionicons name="locate" size={22} color={Colors.textPrimary} />
      </TouchableOpacity>

      {(TILE_URL || (route && route.length >= 2)) && (
        <Text
          style={[styles.attribution, { bottom: bottomInset + 6 }]}
          onPress={() => void Linking.openURL('https://www.mapbox.com/about/maps/')}
          accessibilityRole="link"
        >
          {TILE_URL ? '© Mapbox © OpenStreetMap' : 'Routes © Mapbox © OpenStreetMap'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Elevation.floating,
  },
  recenter: {
    position: 'absolute',
    right: 16,
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: Radii.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
    ...Elevation.floating,
  },
  attribution: {
    position: 'absolute',
    left: 12,
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
  },
});
