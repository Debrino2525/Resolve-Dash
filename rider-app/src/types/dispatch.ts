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

export interface RiderOffer {
  id: string;
  orderId: string;
  expiresAt: string;
  distanceToPickupMeters: number;
  pickup: { lat: number; lng: number; address: string; landmark: string | null };
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

export const PACKAGE_LABEL: Record<PackageType, string> = {
  DOCUMENT: 'Documents',
  SMALL_PARCEL: 'Small parcel',
  FOOD: 'Food',
  LARGE_ITEM: 'Large item',
};

export function cedis(pesewas: number): string {
  return `GH₵${(pesewas / 100).toFixed(2)}`;
}
