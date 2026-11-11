import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AdminInsightsService } from './admin-insights.service';
import { AdminService } from './admin.service';
import { AdminRiderOverview } from './admin.types';

describe('AdminInsightsService', () => {
  const RIDER = '11111111-1111-1111-1111-111111111111';
  const today = new Date().toISOString().slice(0, 10);

  function rider(over: Partial<AdminRiderOverview>): AdminRiderOverview {
    return {
      id: RIDER,
      phoneNumber: '+233241234567',
      fullName: 'Kofi Mensah',
      email: null,
      onboardingStatus: 'ACTIVE',
      subscriptionStatus: 'ACTIVE',
      paidUntil: null,
      graceEndsAt: null,
      createdAt: new Date().toISOString(),
      documentsSubmitted: 4,
      documentsApproved: 4,
      documentsRequired: 4,
      ...over,
    };
  }

  /** Routes each SQL statement to canned rows by recognisable fragments. */
  function setup(rows: Record<string, unknown[]>): AdminInsightsService {
    const db = {
      query: jest.fn(async (sql: string) => {
        const key = Object.keys(rows).find((k) => sql.includes(k));
        return { rows: key ? rows[key] : [] };
      }),
    } as unknown as DatabaseService;
    const admin = {
      listRiders: jest.fn().mockResolvedValue([
        rider({}),
        rider({ id: 'r2', onboardingStatus: 'PENDING_VERIFICATION', subscriptionStatus: 'NONE' }),
        rider({ id: 'r3', subscriptionStatus: 'TRIAL' }),
        rider({
          id: 'r4',
          fullName: 'Ama',
          subscriptionStatus: 'GRACE_PERIOD',
          graceEndsAt: '2026-11-12T00:00:00Z',
        }),
        rider({ id: 'r5', onboardingStatus: 'REJECTED', subscriptionStatus: 'NONE' }),
      ]),
    } as unknown as AdminService;
    return new AdminInsightsService(db, admin);
  }

  it('assembles KPIs, zero-filled 14-day series and needs-attention items', async () => {
    const service = setup({
      "WHERE status = 'SUBMITTED'": [{ n: 3 }],
      'AS d7': [{ d7: '10000', d30: '25000', n30: 5 }],
      'FROM riders WHERE created_at': [{ day: new Date(`${today}T00:00:00Z`), value: '2' }],
      "d.status = 'APPROVED'": [
        {
          rider_id: RIDER,
          full_name: 'Kofi Mensah',
          doc_type: 'INSURANCE',
          expiry_date: '2026-11-20',
        },
      ],
      'MIN(d.submitted_at)': [
        { rider_id: 'r2', full_name: 'Yaw', waiting: 2, oldest: new Date('2026-11-09T10:00:00Z') },
      ],
    });

    const d = await service.getDashboard();

    expect(d.stats).toMatchObject({
      totalRiders: 5,
      pendingVerification: 1,
      activeRiders: 3,
      rejectedRiders: 1,
      onTrial: 1,
      paidActive: 1,
      inGrace: 1,
      documentsAwaitingReview: 3,
      revenue7dPesewas: 10000,
      revenue30dPesewas: 25000,
      payments30d: 5,
    });
    expect(d.signupsPerDay).toHaveLength(14);
    expect(d.signupsPerDay[13]).toEqual({ day: today, value: 2 });
    expect(d.signupsPerDay[0].value).toBe(0);
    expect(d.revenuePerDay.every((p) => p.value === 0)).toBe(true);

    expect(d.attention.map((a) => a.kind)).toEqual([
      'DOCUMENTS_AWAITING_REVIEW',
      'DOCUMENT_EXPIRING',
      'GRACE_PERIOD',
    ]);
    expect(d.attention[0].detail).toBe('2 documents awaiting review');
    expect(d.attention[1].detail).toBe('Motorbike insurance expires 2026-11-20');
    expect(d.attention[2].riderName).toBe('Ama');
  });

  it('404s an unknown rider', async () => {
    await expect(setup({}).getRiderDetail(RIDER)).rejects.toThrow(NotFoundException);
  });

  it('ignores unknown payment status filters', async () => {
    const service = setup({});
    const db = (service as unknown as { db: { query: jest.Mock } }).db;
    await service.listPayments('DROP TABLE');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).not.toContain('p.status = $2');
    expect(params).toEqual([200]);
  });

  it('applies a valid payment status filter as a parameter', async () => {
    const service = setup({});
    const db = (service as unknown as { db: { query: jest.Mock } }).db;
    await service.listPayments('FAILED', 1000);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('p.status = $2');
    expect(params).toEqual([500, 'FAILED']);
  });
});
