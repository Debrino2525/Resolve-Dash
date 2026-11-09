export type TripStatus =
  'REQUESTED' | 'ASSIGNED' | 'ACCEPTED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';

export const MID_TRIP_STATUSES: readonly TripStatus[] = [
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
] as const;

/**
 * Checks whether a given trip status corresponds to a rider being actively mid-trip.
 * Defined as: any trip from ACCEPTED onward (ACCEPTED, PICKED_UP, IN_TRANSIT).
 */
export function isMidTrip(status: TripStatus): boolean {
  return (MID_TRIP_STATUSES as readonly string[]).includes(status);
}

export interface Trip {
  id: string; // UUID v4
  riderId: string | null; // Nullable when initially requested before assignment
  status: TripStatus;
  createdAt: Date;
  updatedAt: Date;
}
