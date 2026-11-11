export type OrderStatus = 'SEARCHING' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED' | 'NO_RIDER';
export type PackageType = 'DOCUMENT' | 'SMALL_PARCEL' | 'FOOD' | 'LARGE_ITEM';

export const ACTIVE_STATUSES: OrderStatus[] = ['SEARCHING', 'ASSIGNED', 'PICKED_UP'];
export const isActive = (s: OrderStatus): boolean => ACTIVE_STATUSES.includes(s);

export const PACKAGE_OPTIONS: { type: PackageType; label: string; hint: string; icon: string }[] = [
  { type: 'DOCUMENT', label: 'Documents', hint: 'Envelopes, files', icon: 'file-document-outline' },
  { type: 'SMALL_PARCEL', label: 'Small parcel', hint: 'Fits in a backpack', icon: 'package-variant-closed' },
  { type: 'FOOD', label: 'Food', hint: 'Meals, groceries', icon: 'food-takeout-box-outline' },
  { type: 'LARGE_ITEM', label: 'Large item', hint: 'Up to a delivery box', icon: 'archive-outline' },
];

export const PACKAGE_LABEL: Record<PackageType, string> = {
  DOCUMENT: 'Documents',
  SMALL_PARCEL: 'Small parcel',
  FOOD: 'Food',
  LARGE_ITEM: 'Large item',
};

export const RATING_TAGS: { tag: string; label: string }[] = [
  { tag: 'FAST', label: 'Fast' },
  { tag: 'POLITE', label: 'Polite' },
  { tag: 'CAREFUL', label: 'Careful with package' },
  { tag: 'COMMUNICATION', label: 'Good communication' },
];

export interface Point {
  lat: number;
  lng: number;
}

export interface OrderStop extends Point {
  address: string;
  landmark: string | null;
  gpsCode: string | null;
  contactName: string;
  contactPhone: string;
}

export interface AssignedRider {
  id: string;
  fullName: string;
  phoneNumber: string;
  plate: string | null;
  rating: number | null;
  completedTrips: number;
  location: { lat: number; lng: number; heading: number | null; updatedAt: string } | null;
}

export interface CustomerOrder {
  id: string;
  code: string;
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
  rider: AssignedRider | null;
}

export interface Quote {
  distanceMeters: number;
  durationSeconds: number;
  baseFarePesewas: number;
  distanceFarePesewas: number;
  farePesewas: number;
  /** True when the road route was unavailable and distance was estimated. */
  estimated: boolean;
  quoteToken: string;
  expiresAt: string;
}

export interface CustomerProfile {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string | null;
  createdAt: string;
}

/** A place chosen on the New delivery form, before contacts are attached. */
export interface Place extends Point {
  address: string;
}

export interface DeliveryDraft {
  pickup: OrderStop;
  dropoff: OrderStop;
  packageType: PackageType;
  fragile: boolean;
  notes: string | null;
}

/** 2453 → "GH₵24.53" */
export function cedis(pesewas: number): string {
  return `GH₵${(pesewas / 100).toFixed(2)}`;
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  SEARCHING: 'Finding a rider',
  ASSIGNED: 'Rider on the way to pickup',
  PICKED_UP: 'On the way to drop-off',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  NO_RIDER: 'No rider found',
};
