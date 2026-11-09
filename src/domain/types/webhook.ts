export interface WebhookEvent {
  id: string; // UUID v4
  dedupeKey: string; // Deterministic: event_type + ':' + reference + ':' + transaction_id
  eventType: string; // e.g. "charge.success", "refund.processed"
  payload: Record<string, unknown>;
  processedAt: Date;
}

export interface PaystackWebhookEnvelope {
  event: string;
  data: {
    id: number;
    reference: string;
    amount: number; // in pesewas
    currency: string;
    status: string;
    channel?: string;
    paid_at?: string;
    customer?: {
      email?: string;
    };
    metadata?: Record<string, unknown>;
  };
}

/**
 * Derives a deterministic deduplication key for Paystack webhooks:
 * event_type + ':' + reference + ':' + transaction_id
 */
export function deriveWebhookDedupeKey(payload: PaystackWebhookEnvelope): string {
  const ref = payload.data.reference || 'no_ref';
  const id = payload.data.id !== undefined ? String(payload.data.id) : 'no_id';
  return `${payload.event}:${ref}:${id}`;
}
