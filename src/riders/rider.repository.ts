import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Rider, RiderOnboardingStatus } from '../domain/types/rider';

interface RawRiderRow {
  id: string;
  phone_number: string;
  email: string | null;
  full_name: string;
  onboarding_status: RiderOnboardingStatus;
  created_at: string | Date;
  updated_at: string | Date;
}

function mapRiderRow(row: RawRiderRow): Rider {
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    email: row.email,
    fullName: row.full_name,
    onboardingStatus: row.onboarding_status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

@Injectable()
export class RiderRepository {
  constructor(private readonly db: DatabaseService) {}

  async findRiderById(id: string): Promise<Rider | null> {
    const res = await this.db.query<RawRiderRow>(
      `SELECT id, phone_number, email, full_name, onboarding_status, created_at, updated_at
       FROM riders
       WHERE id = $1`,
      [id],
    );
    if (res.rows.length === 0) return null;
    return mapRiderRow(res.rows[0]);
  }

  async findRiderByPhone(phone: string): Promise<Rider | null> {
    const res = await this.db.query<RawRiderRow>(
      `SELECT id, phone_number, email, full_name, onboarding_status, created_at, updated_at
       FROM riders
       WHERE phone_number = $1`,
      [phone],
    );
    if (res.rows.length === 0) return null;
    return mapRiderRow(res.rows[0]);
  }

  async createRiderProfile(
    id: string,
    phoneNumber: string,
    email: string | null,
    fullName: string,
  ): Promise<Rider> {
    return this.db.withTransaction(async (client) => {
      // 1. Insert rider profile with PENDING_VERIFICATION
      const riderRes = await client.query<RawRiderRow>(
        `INSERT INTO riders (id, phone_number, email, full_name, onboarding_status)
         VALUES ($1, $2, $3, $4, 'PENDING_VERIFICATION')
         ON CONFLICT (id) DO UPDATE
         SET full_name = EXCLUDED.full_name,
             updated_at = NOW()
         RETURNING *`,
        [id, phoneNumber, email, fullName],
      );

      // 2. Ensure initial subscriptions record exists
      await client.query(
        `INSERT INTO subscriptions (rider_id, status)
         VALUES ($1, 'SUSPENDED')
         ON CONFLICT (rider_id) DO NOTHING`,
        [id],
      );

      return mapRiderRow(riderRes.rows[0]);
    });
  }
}
