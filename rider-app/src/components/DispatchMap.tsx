import { Ionicons } from '@expo/vector-icons';
import { Camera, LineLayer, LocationPuck, MapState, MapView, MarkerView, ShapeSource, StyleImport } from '@rnmapbox/maps';
import React, { useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { GHANA_DEFAULT_CENTER, LatLng } from '../services/location';
import { Colors, Elevation, Radii, TOUCH_TARGET } from '../theme/theme';
import { STANDARD_STYLE, zoomForDelta } from './mapSetup';

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

/** Dark rider map: Mapbox Standard at night, without shop/business or transit labels. */
const RIDER_BASEMAP = {
  lightPreset: 'night' as const,
  showPointOfInterestLabels: false,
  showTransitLabels: false,
  show3dObjects: false,
};
const RIDER_ZOOM = zoomForDelta(0.012);
const pos = (p: LatLng): [number, number] => [p.longitude, p.latitude];

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
  const camera = useRef<Camera>(null);
  const centre = rider ?? GHANA_DEFAULT_CENTER;
  const stops = [rider, pickup, dropoff].filter((p): p is LatLng => Boolean(p));
  const hasRoute = Boolean(route && route.length >= 2);
  const line = hasRoute ? route! : stops;
  const navigating = Boolean(navigationCamera);
  const padding = { paddingTop: topInset, paddingBottom: bottomInset, paddingLeft: 0, paddingRight: 0 };

  const frame = (pts: LatLng[], duration: number): void => {
    const lats = pts.map((p) => p.latitude);
    const lngs = pts.map((p) => p.longitude);
    camera.current?.fitBounds(
      [Math.max(...lngs), Math.max(...lats)],
      [Math.min(...lngs), Math.min(...lats)],
      [topInset + 48, 48, bottomInset + 48, 48],
      duration,
    );
  };

  const chase = (c: { center: LatLng; heading: number }, duration: number): void => {
    camera.current?.setCamera({
      centerCoordinate: pos(c.center),
      heading: c.heading,
      pitch: 45,
      zoomLevel: 17.5,
      padding,
      animationDuration: duration,
    });
  };

  // Turn-by-turn: chase camera on every position update.
  useEffect(() => {
    if (navigationCamera) chase(navigationCamera, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationCamera]);

  // Leaving navigation: back to a flat, north-up view of the job.
  useEffect(() => {
    if (navigating) return;
    camera.current?.setCamera({ heading: 0, pitch: 0, animationDuration: 400 });
  }, [navigating]);

  // Frame the whole job when it appears or its route arrives.
  useEffect(() => {
    if (navigating) return;
    if (pickup && line.length >= 2) frame(line, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup?.latitude, dropoff?.latitude, route?.length]);

  // Follow the rider while idle on duty.
  useEffect(() => {
    if (follow && rider && !pickup) {
      camera.current?.setCamera({ centerCoordinate: pos(rider), zoomLevel: RIDER_ZOOM, padding, animationDuration: 500 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [follow, rider?.latitude, rider?.longitude, pickup]);

  const recenter = (): void => {
    if (navigationCamera) return chase(navigationCamera, 500);
    if (line.length >= 2) return frame(line, 500);
    camera.current?.setCamera({ centerCoordinate: pos(centre), zoomLevel: RIDER_ZOOM, padding, animationDuration: 500 });
  };

  const lineShape =
    line.length >= 2
      ? {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: line.map(pos) },
        }
      : null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        styleURL={STANDARD_STYLE}
        logoEnabled
        logoPosition={{ bottom: bottomInset + 6, left: 8 }}
        attributionEnabled
        attributionPosition={{ bottom: bottomInset + 6, right: 72 }}
        scaleBarEnabled={false}
        compassEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onPress={onMapTouch}
        onCameraChanged={(state: MapState) => {
          if (state.gestures.isGestureActive) onMapTouch?.();
        }}
        accessibilityLabel="Map showing your position and current delivery"
      >
        <StyleImport id="basemap" existing config={RIDER_BASEMAP} />
        <Camera
          ref={camera}
          padding={padding}
          defaultSettings={{ centerCoordinate: pos(centre), zoomLevel: rider ? RIDER_ZOOM : zoomForDelta(0.25) }}
        />
        {rider && <LocationPuck puckBearingEnabled puckBearing="heading" />}

        {lineShape && (
          <ShapeSource id="jobLine" shape={lineShape}>
            <LineLayer
              id="jobLineLayer"
              style={{
                lineColor: Colors.roadRoute,
                lineWidth: 5,
                lineCap: 'round',
                lineJoin: 'round',
                // Straight dashed segments until the road route arrives.
                ...(hasRoute ? {} : { lineDasharray: [2, 1.5] }),
              }}
            />
          </ShapeSource>
        )}

        {pickup && (
          <MarkerView coordinate={pos(pickup)} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
            <View style={[styles.pin, { backgroundColor: Colors.dispatchGreen }]} accessibilityLabel="Pickup">
              <Ionicons name="cube" size={16} color={Colors.onBrand} />
            </View>
          </MarkerView>
        )}
        {dropoff && (
          <MarkerView coordinate={pos(dropoff)} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
            <View style={[styles.pin, { backgroundColor: Colors.harborBlue }]} accessibilityLabel="Drop-off">
              <Ionicons name="flag" size={16} color="#FFFFFF" />
            </View>
          </MarkerView>
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
});
