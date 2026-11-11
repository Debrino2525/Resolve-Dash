import React from 'react';
import type { DispatchMapProps } from './DispatchMapMapbox';
import { mapboxAvailable } from './mapEngine';

export type { DispatchMapProps };

/** Mapbox in installed builds; the earlier map in Expo Go (see mapEngine.ts). */
export function DispatchMap(props: DispatchMapProps): React.JSX.Element {
  const Impl: React.ComponentType<DispatchMapProps> = mapboxAvailable()
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./DispatchMapMapbox').DispatchMapMapbox
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./DispatchMapExpoGo').DispatchMapExpoGo;
  return <Impl {...props} />;
}
