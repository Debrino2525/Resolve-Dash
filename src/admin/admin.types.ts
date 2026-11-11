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
