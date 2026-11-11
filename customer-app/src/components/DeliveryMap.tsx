import React from 'react';
import type { DeliveryMapProps } from './DeliveryMapMapbox';
import { mapboxAvailable } from './mapEngine';

export type { DeliveryMapProps };

/** Mapbox in installed builds; the earlier map in Expo Go (see mapEngine.ts). */
export function DeliveryMap(props: DeliveryMapProps): React.JSX.Element {
  const Impl: React.ComponentType<DeliveryMapProps> = mapboxAvailable()
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./DeliveryMapMapbox').DeliveryMapMapbox
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./DeliveryMapExpoGo').DeliveryMapExpoGo;
  return <Impl {...props} />;
}
