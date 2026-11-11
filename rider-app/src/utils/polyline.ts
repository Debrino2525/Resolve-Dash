export interface DecodedPoint {
  latitude: number;
  longitude: number;
}

/**
 * Decodes an encoded polyline (Google/Mapbox algorithm). Mapbox Directions with
 * `geometries=polyline6` uses precision 6; classic Google polylines use 5.
 */
export function decodePolyline(encoded: string, precision = 6): DecodedPoint[] {
  const factor = 10 ** precision;
  const points: DecodedPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return points;
}
