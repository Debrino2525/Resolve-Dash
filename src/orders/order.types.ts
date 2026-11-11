import type { CallSummary } from './order-call.service';
export type OrderStatus =
  'SEARCHING' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED' | 'NO_RIDER';
export type PackageType = 'DOCUMENT' | 'SMALL_PARCEL' | 'FOOD' | 'LARGE_ITEM';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['SEARCHING', 'ASSIGNED', 'PICKED_UP'];
export const RATING_TAGS = ['FAST', 'POLITE', 'CAREFUL', 'COMMUNICATION'] as const;

export interface OrderStop {
  lat: number;
  lng: number;
  address: string;
  landmark: string | null;
  gpsCode: string | null;
  contactName: string;
  contactPhone: string;
}

/** A stop the customer used before, offered again in the place picker (their own orders only). */
export interface RecentPlace {
  lat: number;
  lng: number;
  address: string;
  landmark: string | null;
  gpsCode: string | null;
  lastUsedAt: string;
}

/** Full order row (internal). */
export interface DeliveryOrder {
  id: string;
  code: string;
  customerId: string;
  riderId: string | null;
  status: OrderStatus;
  pickup: OrderStop;
  dropoff: OrderStop;
  packageType: PackageType;
  fragile: boolean;
  notes: string | null;
  distanceMeters: number;
  durationSeconds: number;
  baseFarePesewas: number;
  distanceFarePesewas: number;
  farePesewas: number;
  paymentMethod: 'CASH';
  deliveryPin: string;
  pinAttempts: number;
  /** Storage path of the optional package photo (order-photos bucket). */
  packagePhotoPath: string | null;
  rating: number | null;
  ratingTags: string[] | null;
  ratingComment: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  requestedAt: string;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
}

/** Rider details shown to the customer once assigned. */
export interface AssignedRider {
  id: string;
  fullName: string;
  phoneNumber: string;
  /** Motorbike registration from the approved roadworthy certificate, if any. */
  plate: string | null;
  rating: number | null;
  completedTrips: number;
  location: { lat: number; lng: number; heading: number | null; updatedAt: string } | null;
}

/** What the customer app receives. Includes the handover PIN; never sent to riders. */
export interface CustomerOrderView extends Omit<
  DeliveryOrder,
  'pinAttempts' | 'customerId' | 'packagePhotoPath'
> {
  rider: AssignedRider | null;
  hasPackagePhoto: boolean;
  messageCount: number;
  /** Current in-app call on this delivery (ringing, active or just ended), if any. */
  call: CallSummary | null;
}

/** What the rider app receives for its current job: no PIN, but both contacts. */
export interface RiderJobView {
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
  /** Current in-app call on this delivery (ringing, active or just ended), if any. */
  call: CallSummary | null;
}

export interface RiderOfferView {
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
