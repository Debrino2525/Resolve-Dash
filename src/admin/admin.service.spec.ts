import { ConflictException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { AdminService, REQUIRED_DOCUMENT_COUNT } from './admin.service';

describe('AdminService.approveRider document gate', () => {
  const RIDER = '11111111-1111-1111-1111-111111111111';
  const ADMIN = '22222222-2222-2222-2222-222222222222';

  function setup(approvedDocs: number): { service: AdminService; queries: string[] } {
    const queries: string[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, ' ').trim());
        if (sql.includes('FROM riders WHERE id = $1 FOR UPDATE')) {
          return { rows: [{ onboarding_status: 'PENDING_VERIFICATION' }] };
        }
        if (sql.includes('FROM rider_documents')) return { rows: [{ approved: approvedDocs }] };
        if (sql.includes('FROM subscriptions WHERE rider_id')) {
          return { rows: [{ id: 's1', status: 'SUSPENDED', trial_used: true }] };
        }
        return { rows: [] };
      }),
    } as unknown as PoolClient;
    const db = {
      withTransaction: jest.fn(async (cb: (c: PoolClient) => Promise<unknown>) => cb(client)),
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            id: RIDER,
            phone_number: '+233241234567',
            full_name: 'Kofi',
            onboarding_status: 'ACTIVE',
            has_subscription: false,
            trial_ends_at: null,
            paid_until: null,
            grace_ends_at: null,
            created_at: new Date(),
            documents_submitted: 4,
            documents_approved: 4,
          },
        ],
      }),
    } as unknown as DatabaseService;
    return { service: new AdminService(db), queries };
  }

  it(`refuses to activate a rider with fewer than ${REQUIRED_DOCUMENT_COUNT} approved documents`, async () => {
    const { service, queries } = setup(3);
    await expect(service.approveRider(RIDER, ADMIN)).rejects.toThrow(ConflictException);
    await expect(service.approveRider(RIDER, ADMIN)).rejects.toThrow('(3/4 approved)');
    expect(
      queries.some((q) => q.startsWith("UPDATE riders SET onboarding_status = 'ACTIVE'")),
    ).toBe(false);
  });

  it('activates and audits once all documents are approved', async () => {
    const { service, queries } = setup(4);
    const result = await service.approveRider(RIDER, ADMIN);

    expect(
      queries.some((q) => q.startsWith("UPDATE riders SET onboarding_status = 'ACTIVE'")),
    ).toBe(true);
    expect(queries.some((q) => q.startsWith('INSERT INTO rider_approval_events'))).toBe(true);
    expect(result.documentsApproved).toBe(4);
  });
});
