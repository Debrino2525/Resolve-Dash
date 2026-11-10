import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { CurrencyGHS, Pesewas, toPesewas } from '../domain/types/money';
import { PaymentStatus, SubscriptionPayment } from '../domain/types/payment';
import { Subscription, SubscriptionStatus } from '../domain/types/subscription';

export interface CreatePaymentRecordParams {
  riderId: string;
  reference: string;
  paystackAccessCode: string | null;
  checkoutExpiresAt: Date;
  amountPesewas: Pesewas;
  currency: CurrencyGHS;
}

export interface CreditSubscriptionInTxParams {
  riderId: string;
  reference: string;
  paystackTransactionId: string;
  channel: string;
  amountPesewas: Pesewas;
  paidAt: Date;
  verifiedAt: Date;
  actorId: string;
}

export interface CreditSubscriptionResult {
  subscription: Subscription;
  payment: SubscriptionPayment;
  periodStart: Date;
  periodEnd: Date;
}

interface RawSubscriptionRow {
  id: string;
  rider_id: string;
  status: SubscriptionStatus;
  trial_ends_at: string | Date | null;
  paid_until: string | Date | null;
  grace_ends_at: string | Date | null;
  trial_used: boolean;
  reminders_sent: Record<string, string[]>;
  created_at: string | Date;
  updated_at: string | Date;
}

interface RawPaymentRow {
  id: string;
  rider_id: string;
  reference: string;
  paystack_access_code: string | null;
  checkout_expires_at: string | Date;
  period_start: string | Date | null;
  period_end: string | Date | null;
  amount_pesewas: number;
  currency: CurrencyGHS;
  status: PaymentStatus;
  paystack_transaction_id: string | null;
  channel: string | null;
  verified_at: string | Date | null;
  paid_at: string | Date | null;
  failure_reason: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function mapSubscriptionRow(row: RawSubscriptionRow): Subscription {
  return {
    id: row.id,
    riderId: row.rider_id,
    status: row.status,
    trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at) : null,
    paidUntil: row.paid_until ? new Date(row.paid_until) : null,
    graceEndsAt: row.grace_ends_at ? new Date(row.grace_ends_at) : null,
    trialUsed: Boolean(row.trial_used),
    remindersSent: row.reminders_sent || {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapPaymentRow(row: RawPaymentRow): SubscriptionPayment {
  return {
    id: row.id,
    riderId: row.rider_id,
    reference: row.reference,
    paystackAccessCode: row.paystack_access_code,
    checkoutExpiresAt: new Date(row.checkout_expires_at),
    periodStart: row.period_start ? new Date(row.period_start) : null,
    periodEnd: row.period_end ? new Date(row.period_end) : null,
    amountPesewas: toPesewas(row.amount_pesewas),
    currency: row.currency,
    status: row.status,
    paystackTransactionId: row.paystack_transaction_id,
    channel: row.channel,
    verifiedAt: row.verified_at ? new Date(row.verified_at) : null,
    paidAt: row.paid_at ? new Date(row.paid_at) : null,
    failureReason: row.failure_reason,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

@Injectable()
export class SubscriptionRepository {
  constructor(private readonly db: DatabaseService) {}

  async findSubscriptionByRiderId(riderId: string): Promise<Subscription | null> {
    const res = await this.db.query<RawSubscriptionRow>(
      `SELECT id, rider_id, status, trial_ends_at, paid_until, grace_ends_at, trial_used, reminders_sent, created_at, updated_at
       FROM subscriptions WHERE rider_id = $1`,
      [riderId],
    );
    if (res.rows.length === 0) return null;
    return mapSubscriptionRow(res.rows[0]);
  }

  async findPendingPaymentByRiderId(riderId: string): Promise<SubscriptionPayment | null> {
    const res = await this.db.query<RawPaymentRow>(
      `SELECT * FROM subscription_payments WHERE rider_id = $1 AND status = 'PENDING' LIMIT 1`,
      [riderId],
    );
    if (res.rows.length === 0) return null;
    return mapPaymentRow(res.rows[0]);
  }

  async findPaymentByReference(reference: string): Promise<SubscriptionPayment | null> {
    const res = await this.db.query<RawPaymentRow>(
      `SELECT * FROM subscription_payments WHERE reference = $1`,
      [reference],
    );
    if (res.rows.length === 0) return null;
    return mapPaymentRow(res.rows[0]);
  }

  async createPendingPayment(params: CreatePaymentRecordParams): Promise<SubscriptionPayment> {
    const res = await this.db.query<RawPaymentRow>(
      `INSERT INTO subscription_payments (
        rider_id, reference, paystack_access_code, checkout_expires_at, amount_pesewas, currency, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
      RETURNING *`,
      [
        params.riderId,
        params.reference,
        params.paystackAccessCode,
        params.checkoutExpiresAt,
        params.amountPesewas,
        params.currency,
      ],
    );
    return mapPaymentRow(res.rows[0]);
  }

  async markPaymentFailed(reference: string, failureReason: string): Promise<void> {
    await this.db.query(
      `UPDATE subscription_payments
       SET status = 'FAILED', failure_reason = $1, updated_at = NOW()
       WHERE reference = $2 AND status = 'PENDING'`,
      [failureReason, reference],
    );
  }

  /** Returns true if a webhook with this dedupe key has already been processed. */
  async webhookEventExists(dedupeKey: string): Promise<boolean> {
    const res = await this.db.query(`SELECT 1 FROM webhook_events WHERE dedupe_key = $1`, [
      dedupeKey,
    ]);
    return res.rows.length > 0;
  }

  /**
   * Attempts to insert deduplication key into webhook_events.
   * Returns true if newly recorded, false if duplicate.
   *
   * Only use this outside a transaction for events that need no further work. When the event
   * triggers side effects, use recordWebhookEventInTransaction so a failure rolls the key back
   * and the provider's retry is processed instead of being dropped as a duplicate.
   */
  async recordWebhookEventIfNotExists(
    dedupeKey: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    return this.insertWebhookEvent(null, dedupeKey, eventType, payload);
  }

  /** Same as recordWebhookEventIfNotExists, but inside the caller's transaction. */
  async recordWebhookEventInTransaction(
    client: PoolClient,
    dedupeKey: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    return this.insertWebhookEvent(client, dedupeKey, eventType, payload);
  }

  private async insertWebhookEvent(
    client: PoolClient | null,
    dedupeKey: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const sql = `INSERT INTO webhook_events (dedupe_key, event_type, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`;
    const values = [dedupeKey, eventType, JSON.stringify(payload)];
    const res = client ? await client.query(sql, values) : await this.db.query(sql, values);
    return res.rows.length > 0;
  }

  /**
   * Atomically credits the subscription inside a client transaction with FOR UPDATE row locks.
   *
   * Idempotent: the payment row is locked first, and if it is already SUCCESS (credited by a
   * concurrent webhook or checkout re-verification) nothing is changed and null is returned.
   */
  async creditSubscriptionInTransaction(
    client: PoolClient,
    params: CreditSubscriptionInTxParams,
  ): Promise<CreditSubscriptionResult | null> {
    // 1. Lock the payment row and skip if another path already credited it
    const lockedPayment = await client.query<{ status: PaymentStatus }>(
      `SELECT status FROM subscription_payments WHERE reference = $1 FOR UPDATE`,
      [params.reference],
    );
    if (lockedPayment.rows.length === 0) {
      throw new Error(`Payment record not found for reference: ${params.reference}`);
    }
    if (lockedPayment.rows[0].status === 'SUCCESS') {
      return null;
    }

    // 2. Lock subscription row
    const subRes = await client.query<RawSubscriptionRow>(
      `SELECT id, rider_id, status, trial_ends_at, paid_until, grace_ends_at, trial_used, reminders_sent, created_at, updated_at
       FROM subscriptions
       WHERE rider_id = $1
       FOR UPDATE`,
      [params.riderId],
    );

    if (subRes.rows.length === 0) {
      throw new Error(`Subscription not found for rider: ${params.riderId}`);
    }

    const currentSub = mapSubscriptionRow(subRes.rows[0]);
    const now = new Date();

    // 3. Compute period_start and period_end
    // Invariant: period_start = max(NOW(), COALESCE(paid_until, NOW()))
    const currentPaidUntil = currentSub.paidUntil;
    const periodStart =
      currentPaidUntil && currentPaidUntil.getTime() > now.getTime()
        ? new Date(currentPaidUntil.getTime())
        : now;
    const periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 4. Update subscription_payments to SUCCESS
    const payRes = await client.query<RawPaymentRow>(
      `UPDATE subscription_payments
       SET status = 'SUCCESS',
           paystack_transaction_id = $1,
           verified_at = $2,
           paid_at = $3,
           channel = $4,
           period_start = $5,
           period_end = $6,
           updated_at = NOW()
       WHERE reference = $7
       RETURNING *`,
      [
        params.paystackTransactionId,
        params.verifiedAt,
        params.paidAt,
        params.channel,
        periodStart,
        periodEnd,
        params.reference,
      ],
    );

    if (payRes.rows.length === 0) {
      throw new Error(`Payment record not found for reference: ${params.reference}`);
    }
    const updatedPayment = mapPaymentRow(payRes.rows[0]);

    // 5. Update subscriptions table
    const updatedSubRes = await client.query<RawSubscriptionRow>(
      `UPDATE subscriptions
       SET paid_until = $1,
           status = 'ACTIVE',
           grace_ends_at = NULL,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [periodEnd, currentSub.id],
    );
    const updatedSub = mapSubscriptionRow(updatedSubRes.rows[0]);

    // 6. Append-only audit record in subscription_events
    await client.query(
      `INSERT INTO subscription_events (
        subscription_id, rider_id, event_type, from_status, to_status, reason, actor_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        currentSub.id,
        params.riderId,
        'PAYMENT_SUCCEEDED',
        currentSub.status,
        'ACTIVE',
        'Weekly subscription renewal credited via Paystack',
        params.actorId,
        JSON.stringify({
          reference: params.reference,
          paystackTransactionId: params.paystackTransactionId,
          amountPesewas: params.amountPesewas,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        }),
      ],
    );

    return {
      subscription: updatedSub,
      payment: updatedPayment,
      periodStart,
      periodEnd,
    };
  }
}
