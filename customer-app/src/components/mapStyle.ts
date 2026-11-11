import { MapStyleElement } from 'react-native-maps';

/**
 * Cleaner Google maps (Android): fewer distractions, same streets.
 * - CLEAN_MAP: overview maps (home, tracking, rider dispatch). No shop/business icons, no
 *   transit markers; streets, area names and our own markers stay.
 * - LANDMARK_MAP: the exact-spot map. Business clutter and transit go, but the landmarks people
 *   give directions by in Ghana stay: schools, hospitals, places of worship, government, parks.
 * iOS (Apple Maps) has no per-type filter: overview maps hide all points of interest instead.
 */
const off = (featureType: string, elementType = 'all'): MapStyleElement => ({
  featureType,
  elementType,
  stylers: [{ visibility: 'off' }],
});

export const CLEAN_MAP: MapStyleElement[] = [off('poi'), off('transit')];

export const LANDMARK_MAP: MapStyleElement[] = [
  off('poi.business'),
  off('poi.attraction'),
  off('poi.sports_complex'),
  off('transit'),
  off('road', 'labels.icon'),
];
