import { SubscriptionStatus } from './subscription';

export type SubscriptionEventType =
  | 'INITIALIZED'
  | 'TRIAL_STARTED'
  | 'ACTIVATED'
  | 'EXTENDED'
  | 'GRACE_ENTERED'
  | 'SUSPENDED'
  | 'REMINDER_RECORDED'
  | 'ADMIN_OVERRIDE'
  | 'FLAGGED_FOR_REVIEW';

export interface SubscriptionEvent {
  id: string; // UUID v4
  subscriptionId: string;
  riderId: string;
  eventType: SubscriptionEventType;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
  reason: string;
  actorId: string; // 'SYSTEM', 'PAYSTACK_WEBHOOK', 'RECONCILIATION_JOB', or admin UUID
  metadata: Record<string, unknown>;
  createdAt: Date;
}
