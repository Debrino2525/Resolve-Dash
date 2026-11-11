import { Camera, LocationPuck, MapState, MapView, StyleImport } from '@rnmapbox/maps';
import React from 'react';
import { StyleSheet } from 'react-native';
import type { ExactSpotMapProps } from './ExactSpotMap';
import { lngLat, SATELLITE_STYLE, STANDARD_STYLE, zoomForDelta } from './mapSetup';

/** ~250 m across: close enough to put the pin on a building or gate. */
const EXACT_DELTA = 0.0025;

export function ExactSpotMapMapbox({ start, satellite, onIdle }: ExactSpotMapProps): React.JSX.Element {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      styleURL={satellite ? SATELLITE_STYLE : STANDARD_STYLE}
      onMapIdle={(state: MapState) => onIdle({ lat: state.properties.center[1], lng: state.properties.center[0] })}
      logoEnabled
      attributionEnabled
      scaleBarEnabled={false}
      compassEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
    >
      {!satellite && (
        // Landmarks people give directions by stay visible; transit clutter goes.
        <StyleImport id="basemap" existing config={{ showPointOfInterestLabels: true, showTransitLabels: false }} />
      )}
      <Camera defaultSettings={{ centerCoordinate: lngLat(start), zoomLevel: zoomForDelta(EXACT_DELTA) }} />
      <LocationPuck puckBearingEnabled={false} />
    </MapView>
  );
}
