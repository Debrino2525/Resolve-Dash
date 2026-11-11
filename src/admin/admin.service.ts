import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { RIDER_DOCUMENT_TYPES } from '../domain/types/document';
import { computeSubscriptionState } from '../subscriptions/subscription-state';
import { AdminRiderOverview, AdminStats } from './admin.types';

interface RawAdminRiderRow {
  id: string;
  phone_number: string;
  full_name: string;
  email: string | null;
  onboarding_status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'REJECTED';
  has_subscription: boolean;
  trial_ends_at: string | Date | null;
  paid_until: string | Date | null;
  grace_ends_at: string | Date | null;
  created_at: string | Date;
  documents_submitted: number;
  documents_approved: number;
}

/** Number of compliance documents a rider must have APPROVED before activation. */
export const REQUIRED_DOCUMENT_COUNT = RIDER_DOCUMENT_TYPES.length;

const toDate = (v: string | Date | null): Date | null => (v ? new Date(v) : null);

/** Audit actor id stored in subscription_events.actor_id. */
const adminActor = (adminId: string): string => `admin:${adminId}`;

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  async getOverview(): Promise<{ stats: AdminStats; riders: AdminRiderOverview[] }> {
    const riders = await this.listRiders();
    return { stats: summarize(riders), riders };
  }

  async listRiders(riderId?: string): Promise<AdminRiderOverview[]> {
    const res = await this.db.query<RawAdminRiderRow>(
      `SELECT
         r.id,
         r.phone_number,
         r.full_name,
         r.email,
         r.onboarding_status,
         r.created_at,
         (s.id IS NOT NULL) AS has_subscription,
         s.trial_ends_at,
         s.paid_until,
         s.grace_ends_at,
         COALESCE(d.submitted, 0)::int AS documents_submitted,
         COALESCE(d.approved, 0)::int AS documents_approved
       FROM riders r
       LEFT JOIN subscriptions s ON r.id = s.rider_id
       LEFT JOIN (
         SELECT rider_id,
                COUNT(*) AS submitted,
                COUNT(*) FILTER (WHERE status = 'APPROVED') AS approved
         FROM rider_documents
         GROUP BY rider_id
       ) d ON d.rider_id = r.id
       ${riderId ? 'WHERE r.id = $1' : ''}
       ORDER BY r.created_at DESC`,
      riderId ? [riderId] : [],
    );

    const now = new Date();
    return res.rows.map((row) => {
      // Status is derived from timestamps; the stored column goes stale as time passes.
      const state = row.has_subscription
        ? computeSubscriptionState(
            {
              trialEndsAt: toDate(row.trial_ends_at),
              paidUntil: toDate(row.paid_until),
              graceEndsAt: toDate(row.grace_ends_at),
            },
            now,
          )
        : null;
      const paidUntil = toDate(row.paid_until);
      return {
        id: row.id,
        phoneNumber: row.phone_number,
        fullName: row.full_name,
        email: row.email,
        onboardingStatus: row.onboarding_status,
        subscriptionStatus: state?.effectiveStatus ?? 'NONE',
        paidUntil: paidUntil ? paidUntil.toISOString() : null,
        graceEndsAt: state?.graceEndsAt ? state.graceEndsAt.toISOString() : null,
        createdAt: new Date(row.created_at).toISOString(),
        documentsSubmitted: Number(row.documents_submitted),
        documentsApproved: Number(row.documents_approved),
        documentsRequired: REQUIRED_DOCUMENT_COUNT,
      };
    });
  }

  async getStats(): Promise<AdminStats> {
    return summarize(await this.listRiders());
  }

  async approveRider(riderId: string, adminId: string): Promise<AdminRiderOverview> {
    const trialDays = readPositiveInt(process.env.TRIAL_PERIOD_DAYS, 14);
    const actor = adminActor(adminId);

    await this.db.withTransaction(async (client) => {
      const status = await lockRiderStatus(client, riderId);
      if (status === 'REJECTED') {
        throw new ConflictException('A rejected rider cannot be approved from this action');
      }

      if (status === 'PENDING_VERIFICATION') {
        // Identity, licence, roadworthiness and insurance must all be checked first.
        const docs = await client.query<{ approved: number }>(
          `SELECT COUNT(*)::int AS approved FROM rider_documents
           WHERE rider_id = $1 AND status = 'APPROVED'`,
          [riderId],
        );
        const approved = Number(docs.rows[0]?.approved ?? 0);
        if (approved < REQUIRED_DOCUMENT_COUNT) {
          throw new ConflictException(
            `Approve all ${REQUIRED_DOCUMENT_COUNT} documents before approving this rider (${approved}/${REQUIRED_DOCUMENT_COUNT} approved).`,
          );
        }

        await client.query(
          `UPDATE riders SET onboarding_status = 'ACTIVE', updated_at = NOW() WHERE id = $1`,
          [riderId],
        );
        await client.query(
          `INSERT INTO rider_approval_events (rider_id, action, admin_id, reason)
           VALUES ($1, 'APPROVED', $2, $3)`,
          [riderId, adminId, 'Approved via admin dashboard'],
        );
      }

      const subscription = await client.query<{
        id: string;
        status: string;
        trial_used: boolean;
      }>(`SELECT id, status, trial_used FROM subscriptions WHERE rider_id = $1 FOR UPDATE`, [
        riderId,
      ]);

      if (subscription.rows.length === 0) {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO subscriptions (rider_id, status, trial_ends_at, trial_used)
           VALUES ($1, 'TRIAL', NOW() + ($2 || ' days')::INTERVAL, TRUE)
           RETURNING id`,
          [riderId, String(trialDays)],
        );
        await client.query(
          `INSERT INTO subscription_events (
             subscription_id, rider_id, event_type, from_status, to_status, reason, actor_id
           ) VALUES ($1, $2, 'TRIAL_STARTED', NULL, 'TRIAL', $3, $4)`,
          [
            inserted.rows[0].id,
            riderId,
            `Trial started for ${trialDays} days when the rider was approved`,
            actor,
          ],
        );
        return;
      }

      const current = subscription.rows[0];
      if (current.trial_used) {
        return;
      }

      await client.query(
        `UPDATE subscriptions
         SET status = 'TRIAL',
             trial_ends_at = NOW() + ($2 || ' days')::INTERVAL,
             trial_used = TRUE,
             updated_at = NOW()
         WHERE id = $1`,
        [current.id, String(trialDays)],
      );
      await client.query(
        `INSERT INTO subscription_events (
           subscription_id, rider_id, event_type, from_status, to_status, reason, actor_id
         ) VALUES ($1, $2, 'TRIAL_STARTED', $3, 'TRIAL', $4, $5)`,
        [
          current.id,
          riderId,
          current.status,
          `Trial started for ${trialDays} days when the rider was approved`,
          actor,
        ],
      );
    });

    return this.requireOverview(riderId);
  }

  async rejectRider(
    riderId: string,
    adminId: string,
    reason?: string,
  ): Promise<AdminRiderOverview> {
    await this.db.withTransaction(async (client) => {
      const status = await lockRiderStatus(client, riderId);
      if (status === 'REJECTED') {
        return; // idempotent: no duplicate audit row
      }
      await client.query(
        `UPDATE riders SET onboarding_status = 'REJECTED', updated_at = NOW() WHERE id = $1`,
        [riderId],
      );
      await client.query(
        `INSERT INTO rider_approval_events (rider_id, action, admin_id, reason)
         VALUES ($1, 'REJECTED', $2, $3)`,
        [riderId, adminId, reason?.trim() || `Rejected via admin dashboard (was ${status})`],
      );
    });

    return this.requireOverview(riderId);
  }

  async grantSubscriptionAccess(
    riderId: string,
    days: number,
    adminId: string,
    note?: string,
  ): Promise<AdminRiderOverview> {
    await this.db.withTransaction(async (client) => {
      await lockRiderStatus(client, riderId);

      const before = await client.query<{ status: string }>(
        `SELECT status FROM subscriptions WHERE rider_id = $1 FOR UPDATE`,
        [riderId],
      );

      const upserted = await client.query<{ id: string; paid_until: Date }>(
        `INSERT INTO subscriptions (rider_id, status, paid_until, grace_ends_at, updated_at)
         VALUES ($1, 'ACTIVE', NOW() + ($2 || ' days')::INTERVAL, NULL, NOW())
         ON CONFLICT (rider_id) DO UPDATE
         SET status = 'ACTIVE',
             paid_until = GREATEST(COALESCE(subscriptions.paid_until, NOW()), NOW()) + ($2 || ' days')::INTERVAL,
             grace_ends_at = NULL,
             updated_at = NOW()
         RETURNING id, paid_until`,
        [riderId, days.toString()],
      );

      // Free access is a financial decision: always leave an audit trail of who granted it.
      await client.query(
        `INSERT INTO subscription_events (
           subscription_id, rider_id, event_type, from_status, to_status, reason, actor_id, metadata
         ) VALUES ($1, $2, 'ADMIN_ACCESS_GRANTED', $3, 'ACTIVE', $4, $5, $6)`,
        [
          upserted.rows[0].id,
          riderId,
          before.rows[0]?.status ?? null,
          note?.trim() || `Admin granted ${days} days of free dispatch access`,
          adminActor(adminId),
          JSON.stringify({ days, paidUntil: new Date(upserted.rows[0].paid_until).toISOString() }),
        ],
      );
    });

    return this.requireOverview(riderId);
  }

  /**
   * Ends a rider's free trial now (e.g. to test or start paid subscriptions). With no paid week
   * the rider is suspended at once (an ended trial gets no automatic grace) and sees "Renew" in
   * the app. The trial can't be restarted. Always audited with the admin and the reason.
   */
  async endTrial(riderId: string, adminId: string, reason: string): Promise<AdminRiderOverview> {
    await this.db.withTransaction(async (client) => {
      await lockRiderStatus(client, riderId);
      const sub = await client.query<{
        id: string;
        status: string;
        trial_ends_at: Date | null;
        paid_until: Date | null;
      }>(
        `SELECT id, status, trial_ends_at, paid_until FROM subscriptions WHERE rider_id = $1 FOR UPDATE`,
        [riderId],
      );
      const row = sub.rows[0];
      if (!row) throw new ConflictException('This rider has no subscription yet (not approved).');
      if (!row.trial_ends_at || new Date(row.trial_ends_at).getTime() <= Date.now()) {
        throw new ConflictException('This rider is not on a free trial.');
      }
      if (row.paid_until && new Date(row.paid_until).getTime() > Date.now()) {
        throw new ConflictException(
          'This rider also has paid time, so ending the trial would not change their access.',
        );
      }
      await client.query(
        `UPDATE subscriptions
         SET trial_ends_at = NOW(), grace_ends_at = NULL, trial_used = TRUE, updated_at = NOW()
         WHERE id = $1`,
        [row.id],
      );
      await client.query(
        `INSERT INTO subscription_events (
           subscription_id, rider_id, event_type, from_status, to_status, reason, actor_id, metadata
         ) VALUES ($1, $2, 'ADMIN_TRIAL_ENDED', 'TRIAL', 'SUSPENDED', $3, $4, $5)`,
        [
          row.id,
          riderId,
          reason.trim(),
          adminActor(adminId),
          JSON.stringify({ trialEndsAtWas: new Date(row.trial_ends_at).toISOString() }),
        ],
      );
    });
    return this.requireOverview(riderId);
  }

  private async requireOverview(riderId: string): Promise<AdminRiderOverview> {
    const [rider] = await this.listRiders(riderId);
    if (!rider) {
      throw new NotFoundException(`Rider with id ${riderId} not found`);
    }
    return rider;
  }
}

/** Locks the rider row for the rest of the transaction and returns its onboarding status. */
async function lockRiderStatus(client: PoolClient, riderId: string): Promise<string> {
  const res = await client.query<{ onboarding_status: string }>(
    `SELECT onboarding_status FROM riders WHERE id = $1 FOR UPDATE`,
    [riderId],
  );
  if (res.rows.length === 0) {
    throw new NotFoundException(`Rider with id ${riderId} not found`);
  }
  return res.rows[0].onboarding_status;
}

function summarize(riders: AdminRiderOverview[]): AdminStats {
  return {
    totalRiders: riders.length,
    pendingVerification: riders.filter((r) => r.onboardingStatus === 'PENDING_VERIFICATION').length,
    activeRiders: riders.filter((r) => r.onboardingStatus === 'ACTIVE').length,
    activeSubscriptions: riders.filter(
      (r) => r.subscriptionStatus === 'ACTIVE' || r.subscriptionStatus === 'TRIAL',
    ).length,
  };
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
