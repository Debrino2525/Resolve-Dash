import type { CallState } from '../components/CallScreen';
export type PackageType = 'DOCUMENT' | 'SMALL_PARCEL' | 'FOOD' | 'LARGE_ITEM';
export type OrderStatus = 'SEARCHING' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED' | 'NO_RIDER';

export interface OrderStop {
  lat: number;
  lng: number;
  address: string;
  landmark: string | null;
  gpsCode: string | null;
  contactName: string;
  contactPhone: string;
}

export type StopStatus = 'PENDING' | 'DELIVERED' | 'FAILED';

/** A drop-off before the final one on a multi-stop job. */
export interface JobStop extends OrderStop {
  index: number;
  status: StopStatus;
  doneAt: string | null;
  failReason: string | null;
}

export interface RiderOffer {
  id: string;
  orderId: string;
  expiresAt: string;
  distanceToPickupMeters: number;
  pickup: { lat: number; lng: number; address: string; landmark: string | null };
  /** Drop-offs on the way, before the final one (missing on older servers). */
  stops?: { lat: number; lng: number; address: string; landmark: string | null }[];
  dropoff: { lat: number; lng: number; address: string; landmark: string | null };
  packageType: PackageType;
  fragile: boolean;
  distanceMeters: number;
  durationSeconds: number;
  farePesewas: number;
  paymentMethod: 'CASH';
  hasPackagePhoto: boolean;
}

export interface RiderJob {
  id: string;
  code: string;
  status: OrderStatus;
  pickup: OrderStop;
  /** Drop-offs to finish, in order, before the final drop-off (missing or empty for one drop). */
  stops?: JobStop[];
  dropoff: OrderStop;
  packageType: PackageType;
  fragile: boolean;
  notes: string | null;
  distanceMeters: number;
  durationSeconds: number;
  farePesewas: number;
  paymentMethod: 'CASH';
  customerName: string;
  assignedAt: string | null;
  pickedUpAt: string | null;
  hasPackagePhoto: boolean;
  messageCount: number;
  /** Current in-app call with the customer (ringing, active or just ended), if any. */
  call: CallState | null;
}

export interface DispatchState {
  online: boolean;
  offer: RiderOffer | null;
  job: RiderJob | null;
  today: { completed: number; cashPesewas: number };
}

/**
 * Where the rider is heading after pickup: the first unfinished drop-off, or the final one.
 * `index` is the server's stop index (null for the final drop-off); `n` of `total` is for display.
 */
export function currentDrop(job: RiderJob): { stop: OrderStop; index: number | null; n: number; total: number } {
  const stops = job.stops ?? [];
  const total = stops.length + 1;
  const i = stops.findIndex((s) => s.status === 'PENDING');
  return i >= 0 ? { stop: stops[i], index: stops[i].index, n: i + 1, total } : { stop: job.dropoff, index: null, n: total, total };
}

/** Drop-offs still to visit, in order, ending with the final one. */
export function remainingDrops(job: RiderJob): OrderStop[] {
  return [...(job.stops ?? []).filter((s) => s.status === 'PENDING'), job.dropoff];
}

export const PACKAGE_LABEL: Record<PackageType, string> = {
  DOCUMENT: 'Documents',
  SMALL_PARCEL: 'Small parcel',
  FOOD: 'Food',
  LARGE_ITEM: 'Large item',
};

export function cedis(pesewas: number): string {
  return `GH₵${(pesewas / 100).toFixed(2)}`;
}
