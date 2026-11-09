export interface AdminRiderOverview {
  id: string;
  phoneNumber: string;
  fullName: string;
  onboardingStatus: 'PENDING_VERIFICATION' | 'ACTIVE' | 'REJECTED';
  subscriptionStatus: string;
  paidUntil: string | null;
  graceEndsAt: string | null;
  createdAt: string;
}

export interface AdminStats {
  totalRiders: number;
  pendingVerification: number;
  activeRiders: number;
  activeSubscriptions: number;
}
