export type OnboardingStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'REJECTED';

export interface AdminRiderOverview {
  id: string;
  phoneNumber: string;
  fullName: string;
  email: string | null;
  onboardingStatus: OnboardingStatus;
  subscriptionStatus: string;
  paidUntil: string | null;
  graceEndsAt: string | null;
  createdAt: string;
  documentsSubmitted: number;
  documentsApproved: number;
  documentsRequired: number;
}

export interface AdminStats {
  totalRiders: number;
  pendingVerification: number;
  activeRiders: number;
  activeSubscriptions: number;
}

export interface DailyPoint {
  /** YYYY-MM-DD (UTC) */
  day: string;
  value: number;
}

export interface AttentionItem {
  kind: 'DOCUMENTS_AWAITING_REVIEW' | 'DOCUMENT_EXPIRING' | 'GRACE_PERIOD';
  riderId: string;
  riderName: string;
  detail: string;
  since: string | null;
}

export interface ActivityItem {
  kind: 'APPROVAL' | 'SUBSCRIPTION' | 'PAYMENT';
  riderId: string;
  riderName: string;
  title: string;
  detail: string | null;
  actor: string | null;
  at: string;
}

export interface AdminDashboard {
  stats: {
    totalRiders: number;
    pendingVerification: number;
    activeRiders: number;
    rejectedRiders: number;
    onTrial: number;
    paidActive: number;
    inGrace: number;
    documentsAwaitingReview: number;
    revenue7dPesewas: number;
    revenue30dPesewas: number;
    payments30d: number;
  };
  /** New rider sign-ups per day, last 14 days. */
  signupsPerDay: DailyPoint[];
  /** Verified subscription revenue (pesewas) per day, last 14 days. */
  revenuePerDay: DailyPoint[];
  attention: AttentionItem[];
  activity: ActivityItem[];
}

export interface AdminRiderDetail {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string | null;
  onboardingStatus: OnboardingStatus;
  createdAt: string;
  subscription: {
    status: string;
    canAccept: boolean;
    trialEndsAt: string | null;
    paidUntil: string | null;
    graceEndsAt: string | null;
  } | null;
  timeline: ActivityItem[];
}

export interface AdminPayment {
  id: string;
  reference: string;
  riderId: string;
  riderName: string;
  amountPesewas: number;
  status: string;
  channel: string | null;
  paidAt: string | null;
  createdAt: string;
  failureReason: string | null;
  periodEnd: string | null;
}

// ---------------------------------------------------------------- deliveries, customers, live

export type DeliveryStatus =
  'SEARCHING' | 'ASSIGNED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED' | 'NO_RIDER';

/** Portal filter groups: ACTIVE = SEARCHING/ASSIGNED/PICKED_UP, CANCELLED includes NO_RIDER. */
export type DeliveryFilter = 'ACTIVE' | 'DELIVERED' | 'CANCELLED';

export interface Paged<T> {
  items: T[];
  total: number;
  /** 1-based. */
  page: number;
  pageSize: number;
}

export interface AdminStopPoint {
  lat: number;
  lng: number;
  address: string;
  landmark: string | null;
}

export interface AdminStop extends AdminStopPoint {
  gpsCode: string | null;
  contactName: string;
  contactPhone: string;
}

/** One order row in the admin portal. Never carries the delivery PIN or storage paths. */
export interface AdminDelivery {
  id: string;
  code: string;
  status: DeliveryStatus;
  customerId: string;
  customerName: string;
  customerPhone: string;
  riderId: string | null;
  riderName: string | null;
  riderPhone: string | null;
  farePesewas: number;
  packageType: string;
  fragile: boolean;
  distanceMeters: number;
  pickup: AdminStopPoint;
  dropoff: AdminStopPoint;
  requestedAt: string;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: string | null;
  rating: number | null;
}

export interface AdminOffer {
  id: string;
  riderId: string;
  riderName: string;
  status: 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'WITHDRAWN';
  distanceToPickupMeters: number;
  offeredAt: string;
  expiresAt: string;
  respondedAt: string | null;
}

export interface DeliveryEvent {
  kind:
    | 'REQUESTED'
    | 'OFFERED'
    | 'OFFER_ACCEPTED'
    | 'OFFER_DECLINED'
    | 'OFFER_EXPIRED'
    | 'OFFER_WITHDRAWN'
    | 'ASSIGNED'
    | 'PICKED_UP'
    | 'DELIVERED'
    | 'CANCELLED'
    | 'NO_RIDER'
    | 'RATED';
  title: string;
  detail: string | null;
  at: string;
}

/** A drop-off before the final one on a multi-stop delivery (never its PIN). */
export interface AdminExtraStop extends AdminStop {
  status: 'PENDING' | 'DELIVERED' | 'FAILED';
  doneAt: string | null;
  failReason: string | null;
  pinAttempts: number;
}

export interface AdminDeliveryDetail extends Omit<AdminDelivery, 'pickup' | 'dropoff'> {
  pickup: AdminStop;
  /** Drop-offs before the final one, in visiting order (empty for a single drop-off). */
  stops: AdminExtraStop[];
  dropoff: AdminStop;
  stopsFarePesewas: number;
  notes: string | null;
  durationSeconds: number;
  baseFarePesewas: number;
  distanceFarePesewas: number;
  paymentMethod: string;
  ratingTags: string[] | null;
  ratingComment: string | null;
  /** Wrong PIN entries by the rider (the PIN itself is never exposed). */
  pinAttempts: number;
  hasPackagePhoto: boolean;
  /** Set when GhanaDash support marked it delivered or cancelled it. */
  closedBySupport: boolean;
  /** Support's reason or note for closing it. */
  supportNote: string | null;
  /** Oldest first. */
  timeline: DeliveryEvent[];
  /** Oldest first. */
  offers: AdminOffer[];
}

export interface AdminCustomer {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string | null;
  createdAt: string;
  deliveries: number;
  delivered: number;
  lastDeliveryAt: string | null;
}

export interface AdminCustomerDetail extends AdminCustomer {
  cancelled: number;
  active: number;
  /** Total fare of delivered orders (cash collected by riders). */
  deliveredFarePesewas: number;
  /** Newest first, at most 100. */
  orders: AdminDelivery[];
}

export interface LiveRider {
  id: string;
  fullName: string;
  phoneNumber: string;
  lat: number;
  lng: number;
  heading: number | null;
  updatedAt: string;
  /** The rider's current job (ASSIGNED or PICKED_UP), if any. */
  job: { orderId: string; code: string; status: DeliveryStatus } | null;
}

export interface LiveDelivery {
  id: string;
  code: string;
  status: DeliveryStatus;
  riderId: string | null;
  riderName: string | null;
  customerName: string;
  farePesewas: number;
  pickup: AdminStopPoint;
  dropoff: AdminStopPoint;
  requestedAt: string;
}

export interface AdminLiveSnapshot {
  generatedAt: string;
  riders: LiveRider[];
  deliveries: LiveDelivery[];
}
