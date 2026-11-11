import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DOCUMENT_RULES, RiderDocumentType } from '../domain/types/document';
import { computeSubscriptionState } from '../subscriptions/subscription-state';
import { AdminService } from './admin.service';
import {
  ActivityItem,
  AdminDashboard,
  AdminPayment,
  AdminRiderDetail,
  AttentionItem,
  DailyPoint,
} from './admin.types';

const toDate = (v: string | Date | null): Date | null => (v ? new Date(v) : null);
const iso = (v: string | Date | null): string | null => (v ? new Date(v).toISOString() : null);

const DAYS = 14;

/** Read-only queries behind the admin portal: dashboard, rider detail and payments. */
@Injectable()
export class AdminInsightsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly admin: AdminService,
  ) {}

  async getDashboard(): Promise<AdminDashboard> {
    const [riders, docsAwaiting, revenue, signups, revenueSeries, expiring, queue, activity] =
      await Promise.all([
        this.admin.listRiders(),
        this.db.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM rider_documents WHERE status = 'SUBMITTED'`,
        ),
        this.db.query<{ d7: string; d30: string; n30: number }>(
          `SELECT
             COALESCE(SUM(amount_pesewas) FILTER (WHERE paid_at > NOW() - INTERVAL '7 days'), 0)::text AS d7,
             COALESCE(SUM(amount_pesewas) FILTER (WHERE paid_at > NOW() - INTERVAL '30 days'), 0)::text AS d30,
             COUNT(*) FILTER (WHERE paid_at > NOW() - INTERVAL '30 days')::int AS n30
           FROM subscription_payments WHERE status = 'SUCCESS'`,
        ),
        this.dailySeries(
          `SELECT date_trunc('day', created_at) AS day, COUNT(*)::bigint AS value
           FROM riders WHERE created_at > NOW() - INTERVAL '${DAYS} days' GROUP BY 1`,
        ),
        this.dailySeries(
          `SELECT date_trunc('day', paid_at) AS day, SUM(amount_pesewas)::bigint AS value
           FROM subscription_payments
           WHERE status = 'SUCCESS' AND paid_at > NOW() - INTERVAL '${DAYS} days' GROUP BY 1`,
        ),
        this.db.query<{
          rider_id: string;
          full_name: string;
          doc_type: RiderDocumentType;
          expiry_date: string | Date;
        }>(
          `SELECT d.rider_id, r.full_name, d.doc_type, d.expiry_date
           FROM rider_documents d JOIN riders r ON r.id = d.rider_id
           WHERE d.status = 'APPROVED' AND d.expiry_date IS NOT NULL
             AND d.expiry_date <= CURRENT_DATE + 30
           ORDER BY d.expiry_date ASC LIMIT 20`,
        ),
        this.db.query<{ rider_id: string; full_name: string; waiting: number; oldest: Date }>(
          `SELECT d.rider_id, r.full_name, COUNT(*)::int AS waiting, MIN(d.submitted_at) AS oldest
           FROM rider_documents d JOIN riders r ON r.id = d.rider_id
           WHERE d.status = 'SUBMITTED' AND r.onboarding_status <> 'REJECTED'
           GROUP BY d.rider_id, r.full_name
           ORDER BY oldest ASC LIMIT 20`,
        ),
        this.recentActivity(null, 25),
      ]);

    const attention: AttentionItem[] = [
      ...queue.rows.map((q): AttentionItem => ({
        kind: 'DOCUMENTS_AWAITING_REVIEW',
        riderId: q.rider_id,
        riderName: q.full_name,
        detail: `${q.waiting} document${q.waiting === 1 ? '' : 's'} awaiting review`,
        since: iso(q.oldest),
      })),
      ...expiring.rows.map((e): AttentionItem => {
        const expiry =
          typeof e.expiry_date === 'string' ? e.expiry_date.slice(0, 10) : isoDay(e.expiry_date);
        return {
          kind: 'DOCUMENT_EXPIRING',
          riderId: e.rider_id,
          riderName: e.full_name,
          detail: `${DOCUMENT_RULES[e.doc_type].label} expires ${expiry}`,
          since: null,
        };
      }),
      ...riders
        .filter((r) => r.subscriptionStatus === 'GRACE_PERIOD')
        .map((r): AttentionItem => ({
          kind: 'GRACE_PERIOD',
          riderId: r.id,
          riderName: r.fullName,
          detail: 'In grace period: plan needs renewing',
          since: r.graceEndsAt,
        })),
    ];

    const sub = (s: string): number => riders.filter((r) => r.subscriptionStatus === s).length;
    return {
      stats: {
        totalRiders: riders.length,
        pendingVerification: riders.filter((r) => r.onboardingStatus === 'PENDING_VERIFICATION')
          .length,
        activeRiders: riders.filter((r) => r.onboardingStatus === 'ACTIVE').length,
        rejectedRiders: riders.filter((r) => r.onboardingStatus === 'REJECTED').length,
        onTrial: sub('TRIAL'),
        paidActive: sub('ACTIVE'),
        inGrace: sub('GRACE_PERIOD'),
        documentsAwaitingReview: docsAwaiting.rows[0]?.n ?? 0,
        revenue7dPesewas: Number(revenue.rows[0]?.d7 ?? 0),
        revenue30dPesewas: Number(revenue.rows[0]?.d30 ?? 0),
        payments30d: revenue.rows[0]?.n30 ?? 0,
      },
      signupsPerDay: signups,
      revenuePerDay: revenueSeries,
      attention,
      activity,
    };
  }

  async getRiderDetail(riderId: string): Promise<AdminRiderDetail> {
    const res = await this.db.query<{
      id: string;
      full_name: string;
      phone_number: string;
      email: string | null;
      onboarding_status: AdminRiderDetail['onboardingStatus'];
      created_at: Date;
      trial_ends_at: Date | null;
      paid_until: Date | null;
      grace_ends_at: Date | null;
      has_subscription: boolean;
    }>(
      `SELECT r.id, r.full_name, r.phone_number, r.email, r.onboarding_status, r.created_at,
              s.trial_ends_at, s.paid_until, s.grace_ends_at, (s.id IS NOT NULL) AS has_subscription
       FROM riders r LEFT JOIN subscriptions s ON s.rider_id = r.id
       WHERE r.id = $1`,
      [riderId],
    );
    const row = res.rows[0];
    if (!row) throw new NotFoundException(`Rider with id ${riderId} not found`);

    const state = row.has_subscription
      ? computeSubscriptionState(
          {
            trialEndsAt: toDate(row.trial_ends_at),
            paidUntil: toDate(row.paid_until),
            graceEndsAt: toDate(row.grace_ends_at),
          },
          new Date(),
        )
      : null;

    return {
      id: row.id,
      fullName: row.full_name,
      phoneNumber: row.phone_number,
      email: row.email,
      onboardingStatus: row.onboarding_status,
      createdAt: new Date(row.created_at).toISOString(),
      subscription: state
        ? {
            status: state.effectiveStatus,
            canAccept: state.canAccept,
            trialEndsAt: iso(row.trial_ends_at),
            paidUntil: iso(row.paid_until),
            graceEndsAt: state.graceEndsAt?.toISOString() ?? null,
          }
        : null,
      timeline: await this.recentActivity(riderId, 60),
    };
  }

  async listPayments(status: string | undefined, limit = 200): Promise<AdminPayment[]> {
    const allowed = ['PENDING', 'SUCCESS', 'FAILED', 'FLAGGED_FOR_REVIEW'];
    const filter = status && allowed.includes(status) ? status : null;
    const res = await this.db.query<{
      id: string;
      reference: string;
      rider_id: string;
      full_name: string;
      amount_pesewas: number;
      status: string;
      channel: string | null;
      paid_at: Date | null;
      created_at: Date;
      failure_reason: string | null;
      period_end: Date | null;
    }>(
      `SELECT p.id, p.reference, p.rider_id, r.full_name, p.amount_pesewas, p.status, p.channel,
              p.paid_at, p.created_at, p.failure_reason, p.period_end
       FROM subscription_payments p JOIN riders r ON r.id = p.rider_id
       ${filter ? 'WHERE p.status = $2' : ''}
       ORDER BY p.created_at DESC
       LIMIT $1`,
      filter ? [Math.min(limit, 500), filter] : [Math.min(limit, 500)],
    );
    return res.rows.map((p) => ({
      id: p.id,
      reference: p.reference,
      riderId: p.rider_id,
      riderName: p.full_name,
      amountPesewas: Number(p.amount_pesewas),
      status: p.status,
      channel: p.channel,
      paidAt: iso(p.paid_at),
      createdAt: new Date(p.created_at).toISOString(),
      failureReason: p.failure_reason,
      periodEnd: iso(p.period_end),
    }));
  }

  /** Approval decisions, subscription events and payments, newest first. */
  private async recentActivity(riderId: string | null, limit: number): Promise<ActivityItem[]> {
    const where = (col: string): string => (riderId ? `WHERE ${col} = $2` : '');
    const res = await this.db.query<{
      kind: ActivityItem['kind'];
      rider_id: string;
      full_name: string;
      title: string;
      detail: string | null;
      actor: string | null;
      at: Date;
    }>(
      `SELECT * FROM (
         SELECT 'APPROVAL'::text AS kind, e.rider_id, r.full_name,
                CASE e.action WHEN 'APPROVED' THEN 'Rider approved' ELSE 'Rider rejected' END AS title,
                e.reason AS detail, 'admin:' || e.admin_id::text AS actor, e.created_at AS at
         FROM rider_approval_events e JOIN riders r ON r.id = e.rider_id ${where('e.rider_id')}
         UNION ALL
         SELECT 'SUBSCRIPTION'::text, e.rider_id, r.full_name,
                upper(left(e.event_type, 1)) || replace(lower(substr(e.event_type, 2)), '_', ' '),
                e.reason, e.actor_id, e.created_at
         FROM subscription_events e JOIN riders r ON r.id = e.rider_id ${where('e.rider_id')}
         UNION ALL
         SELECT 'PAYMENT'::text, p.rider_id, r.full_name,
                CASE p.status WHEN 'SUCCESS' THEN 'Payment received'
                              WHEN 'FAILED' THEN 'Payment failed'
                              WHEN 'PENDING' THEN 'Checkout started'
                              ELSE 'Payment flagged' END,
                'GH₵' || to_char(p.amount_pesewas / 100.0, 'FM999990.00')
                  || COALESCE(' via ' || p.channel, ''),
                NULL, COALESCE(p.paid_at, p.created_at)
         FROM subscription_payments p JOIN riders r ON r.id = p.rider_id ${where('p.rider_id')}
       ) a
       ORDER BY at DESC
       LIMIT $1`,
      riderId ? [limit, riderId] : [limit],
    );
    return res.rows.map((a) => ({
      kind: a.kind,
      riderId: a.rider_id,
      riderName: a.full_name,
      title: a.title,
      detail: a.detail,
      actor: a.actor,
      at: new Date(a.at).toISOString(),
    }));
  }

  /** Zero-filled daily series for the last DAYS days (oldest first). */
  private async dailySeries(sql: string): Promise<DailyPoint[]> {
    const res = await this.db.query<{ day: Date; value: string }>(sql);
    const byDay = new Map(res.rows.map((r) => [isoDay(new Date(r.day)), Number(r.value)]));
    const out: DailyPoint[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      const key = isoDay(d);
      out.push({ day: key, value: byDay.get(key) ?? 0 });
    }
    return out;
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
