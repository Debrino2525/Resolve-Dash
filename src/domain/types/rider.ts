export type RiderOnboardingStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'REJECTED';

export interface Rider {
  id: string; // UUID v4
  phoneNumber: string; // e.g. "+233241234567"
  email: string | null;
  fullName: string;
  onboardingStatus: RiderOnboardingStatus;
  createdAt: Date;
  updatedAt: Date;
}
