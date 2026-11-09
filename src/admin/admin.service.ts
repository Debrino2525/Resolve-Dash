import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AdminRiderOverview, AdminStats } from './admin.types';

interface RawAdminRiderRow {
  id: string;
  phone_number: string;
  full_name: string;
  onboarding_status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'REJECTED';
  subscription_status: string | null;
  paid_until: string | Date | null;
  grace_ends_at: string | Date | null;
  created_at: string | Date;
}

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  async listRiders(): Promise<AdminRiderOverview[]> {
    const res = await this.db.query<RawAdminRiderRow>(
      `SELECT
         r.id,
         r.phone_number,
         r.full_name,
         r.onboarding_status,
         r.created_at,
         COALESCE(s.status, 'NONE') AS subscription_status,
         s.paid_until,
         s.grace_ends_at
       FROM riders r
       LEFT JOIN subscriptions s ON r.id = s.rider_id
       ORDER BY r.created_at DESC`,
      [],
    );

    return res.rows.map((row) => ({
      id: row.id,
      phoneNumber: row.phone_number,
      fullName: row.full_name,
      onboardingStatus: row.onboarding_status,
      subscriptionStatus: row.subscription_status ?? 'NONE',
      paidUntil: row.paid_until ? new Date(row.paid_until).toISOString() : null,
      graceEndsAt: row.grace_ends_at ? new Date(row.grace_ends_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async getStats(): Promise<AdminStats> {
    const riders = await this.listRiders();
    const totalRiders = riders.length;
    const pendingVerification = riders.filter(
      (r) => r.onboardingStatus === 'PENDING_VERIFICATION',
    ).length;
    const activeRiders = riders.filter((r) => r.onboardingStatus === 'ACTIVE').length;
    const activeSubscriptions = riders.filter(
      (r) => r.subscriptionStatus === 'ACTIVE' || r.subscriptionStatus === 'TRIAL',
    ).length;

    return {
      totalRiders,
      pendingVerification,
      activeRiders,
      activeSubscriptions,
    };
  }

  async approveRider(riderId: string): Promise<AdminRiderOverview> {
    const res = await this.db.query<RawAdminRiderRow>(
      `UPDATE riders
       SET onboarding_status = 'ACTIVE', updated_at = NOW()
       WHERE id = $1
       RETURNING id, phone_number, full_name, onboarding_status, created_at, NULL as subscription_status, NULL as paid_until, NULL as grace_ends_at`,
      [riderId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Rider with id ${riderId} not found`);
    }

    // Ensure rider has a subscription row
    await this.db.query(
      `INSERT INTO subscriptions (rider_id, status)
       VALUES ($1, 'SUSPENDED')
       ON CONFLICT (rider_id) DO NOTHING`,
      [riderId],
    );

    const riders = await this.listRiders();
    const updated = riders.find((r) => r.id === riderId);
    if (!updated) {
      throw new NotFoundException(`Rider with id ${riderId} not found`);
    }
    return updated;
  }

  async rejectRider(riderId: string): Promise<AdminRiderOverview> {
    const res = await this.db.query<RawAdminRiderRow>(
      `UPDATE riders
       SET onboarding_status = 'REJECTED', updated_at = NOW()
       WHERE id = $1
       RETURNING id, phone_number, full_name, onboarding_status, created_at, NULL as subscription_status, NULL as paid_until, NULL as grace_ends_at`,
      [riderId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Rider with id ${riderId} not found`);
    }

    const riders = await this.listRiders();
    const updated = riders.find((r) => r.id === riderId);
    if (!updated) {
      throw new NotFoundException(`Rider with id ${riderId} not found`);
    }
    return updated;
  }

  async grantSubscriptionAccess(
    riderId: string,
    days: number = 7,
  ): Promise<AdminRiderOverview> {
    await this.db.query(
      `INSERT INTO subscriptions (rider_id, status, paid_until, grace_ends_at, updated_at)
       VALUES ($1, 'ACTIVE', NOW() + ($2 || ' days')::INTERVAL, NULL, NOW())
       ON CONFLICT (rider_id) DO UPDATE
       SET status = 'ACTIVE',
           paid_until = GREATEST(COALESCE(subscriptions.paid_until, NOW()), NOW()) + ($2 || ' days')::INTERVAL,
           grace_ends_at = NULL,
           updated_at = NOW()`,
      [riderId, days.toString()],
    );

    const riders = await this.listRiders();
    const updated = riders.find((r) => r.id === riderId);
    if (!updated) {
      throw new NotFoundException(`Rider with id ${riderId} not found`);
    }
    return updated;
  }
}
