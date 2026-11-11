import Mapbox from '@rnmapbox/maps';

/**
 * Mapbox maps (native SDK, no Google key needed). The public pk. token from the build settings;
 * the secret download token is only used when building, never shipped.
 */
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

/** Mapbox Standard: Mapbox's current style; configured per map with <StyleImport id="basemap">. */
export const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';
export const SATELLITE_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

/**
 * Overview maps (home, tracking): streets and area names only, no shop/business or transit
 * labels. The exact-spot map turns points of interest back on (landmarks people navigate by).
 */
export const CLEAN_BASEMAP = {
  showPointOfInterestLabels: false,
  showTransitLabels: false,
  show3dObjects: false,
};

/** [lng, lat], Mapbox's coordinate order. */
export const lngLat = (p: { lat: number; lng: number }): [number, number] => [p.lng, p.lat];

/** Zoom that shows about the same area as react-native-maps' latitudeDelta did. */
export const zoomForDelta = (delta: number): number => Math.log2(360 / delta);
