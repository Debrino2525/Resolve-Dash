import React from 'react';
import { StyleSheet } from 'react-native';
import MapView from 'react-native-maps';
import type { ExactSpotMapProps } from './ExactSpotMap';
import { LANDMARK_MAP } from './mapStyle';

const EXACT_DELTA = 0.0025;

/** Expo Go only (no Mapbox SDK there). */
export function ExactSpotMapExpoGo({ start, satellite, onIdle }: ExactSpotMapProps): React.JSX.Element {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={{ latitude: start.lat, longitude: start.lng, latitudeDelta: EXACT_DELTA, longitudeDelta: EXACT_DELTA }}
      onRegionChangeComplete={(r) => onIdle({ lat: r.latitude, lng: r.longitude })}
      mapType={satellite ? 'hybrid' : 'standard'}
      showsUserLocation
      showsBuildings
      showsTraffic={false}
      showsIndoors={false}
      customMapStyle={LANDMARK_MAP}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
    />
  );
}
