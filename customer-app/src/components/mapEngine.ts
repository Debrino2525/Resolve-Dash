/**
 * Which map engine this app binary has. Installed GhanaDash builds include Mapbox's native SDK;
 * Expo Go does not (importing @rnmapbox/maps there throws), so Expo Go falls back to
 * react-native-maps (Apple Maps on iPhone). Map components load their implementation lazily
 * through this, so neither library is touched where it can't run.
 */
let mapbox: boolean | undefined;
export function mapboxAvailable(): boolean {
  if (mapbox === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@rnmapbox/maps');
      mapbox = true;
    } catch {
      mapbox = false;
    }
  }
  return mapbox;
}
