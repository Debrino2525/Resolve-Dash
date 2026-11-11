import { NativeModules } from 'react-native';

/**
 * Which map engine this app binary has. Installed GhanaDash builds include Mapbox's native SDK;
 * Expo Go does not. This checks for Mapbox's native module the same way the library itself does,
 * without importing it: in development, a module that throws while loading is reported as a fatal
 * error even inside try/catch, so @rnmapbox/maps must never be imported in Expo Go. Without it,
 * maps fall back to react-native-maps (Apple Maps on iPhone in Expo Go).
 */
export function mapboxAvailable(): boolean {
  return NativeModules.RNMBXModule != null;
}
