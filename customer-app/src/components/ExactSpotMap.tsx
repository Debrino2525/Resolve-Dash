import React from 'react';
import { Point } from '../types/orders';
import { mapboxAvailable } from './mapEngine';

export interface ExactSpotMapProps {
  /** Where the map opens (the centre is the pin). */
  start: Point;
  satellite: boolean;
  /** Called when the map stops moving, with the point under the pin. */
  onIdle: (p: Point) => void;
}

/** The zoomed-in map under the fixed pin. Mapbox in installed builds; earlier map in Expo Go. */
export function ExactSpotMap(props: ExactSpotMapProps): React.JSX.Element {
  const Impl: React.ComponentType<ExactSpotMapProps> = mapboxAvailable()
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./ExactSpotMapMapbox').ExactSpotMapMapbox
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./ExactSpotMapExpoGo').ExactSpotMapExpoGo;
  return <Impl {...props} />;
}
