import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as crypto from 'crypto';
import helmet from 'helmet';
import request from 'supertest';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import { AdminGuard } from '../src/auth/admin.guard';
import { SupabaseAuthGuard } from '../src/auth/supabase-auth.guard';

describe('Admin portal E2E (auth lockdown)', () => {
  let app: INestApplication;
  let mockAdminService: jest.Mocked<AdminService>;
  const TEST_SECRET = 'admin-e2e-secret-key-67890';
  const RIDER_ID = '44444444-4444-4444-4444-444444444444';
  const originalFetch = globalThis.fetch;

  function jwt(
    appMetadata: Record<string, unknown>,
    userMetadata: Record<string, unknown> = {},
  ): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: '55555555-5555-5555-5555-555555555555',
        email: 'ops@example.com',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        app_metadata: appMetadata,
        user_metadata: userMetadata,
      }),
    ).toString('base64url');
    const sig = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');
    return `${header}.${payload}.${sig}`;
  }

  const adminToken = (): string => jwt({ role: 'admin' });
  const riderToken = (): string => jwt({ role: 'rider' }, { role: 'admin' }); // user_metadata is user-editable

  beforeAll(async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_SECRET;
    process.env.SUPABASE_ANON_KEY = 'anon-test-key';

    mockAdminService = {
      getStats: jest.fn().mockResolvedValue({
        totalRiders: 1,
        pendingVerification: 1,
        activeRiders: 0,
        activeSubscriptions: 0,
      }),
      listRiders: jest.fn().mockResolvedValue([]),
      approveRider: jest.fn().mockResolvedValue({ id: RIDER_ID }),
      rejectRider: jest.fn().mockResolvedValue({ id: RIDER_ID }),
      grantSubscriptionAccess: jest.fn().mockResolvedValue({ id: RIDER_ID }),
    } as unknown as jest.Mocked<AdminService>;

    @Module({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        AdminAuthService,
        SupabaseAuthGuard,
        AdminGuard,
      ],
    })
    class TestAdminModule {}

    app = await NestFactory.create(TestAdminModule, { logger: false });
    app.use(helmet());
    await app.init();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const mutatingRoutes = ['approve', 'reject', 'grant-access'];

  it('rejects unauthenticated access to rider data with 401', async () => {
    await request(app.getHttpServer()).get('/admin/api/riders').expect(401);
    expect(mockAdminService.listRiders).not.toHaveBeenCalled();
  });

  it.each(mutatingRoutes)('rejects unauthenticated POST %s with 401', async (action) => {
    await request(app.getHttpServer()).post(`/admin/api/riders/${RIDER_ID}/${action}`).expect(401);
  });

  it('rejects a rider token (even with role=admin in user_metadata) with 403', async () => {
    await request(app.getHttpServer())
      .get('/admin/api/riders')
      .set('Authorization', `Bearer ${riderToken()}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/admin/api/riders/${RIDER_ID}/grant-access`)
      .set('Authorization', `Bearer ${riderToken()}`)
      .expect(403);
    expect(mockAdminService.grantSubscriptionAccess).not.toHaveBeenCalled();
  });

  it('allows an app_metadata admin token', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/api/riders')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(200);
    expect(res.body.stats.totalRiders).toBe(1);

    await request(app.getHttpServer())
      .post(`/admin/api/riders/${RIDER_ID}/approve`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(201);
    expect(mockAdminService.approveRider).toHaveBeenCalledWith(RIDER_ID);
  });

  it('rejects non-UUID rider ids with 400', async () => {
    await request(app.getHttpServer())
      .post('/admin/api/riders/not-a-uuid/approve')
      .set('Authorization', `Bearer ${adminToken()}`)
      .expect(400);
  });

  it('serves a page with no inline scripts or inline handlers (CSP-compatible)', async () => {
    const res = await request(app.getHttpServer()).get('/admin').expect(200);
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.text).toContain('<script src="/admin/app.js" defer></script>');
    expect(res.text).not.toMatch(/<script>(?!<\/script>)/);
    expect(res.text).not.toMatch(/\son[a-z]+="/i);

    const js = await request(app.getHttpServer()).get('/admin/app.js').expect(200);
    expect(js.headers['content-type']).toContain('application/javascript');
  });

  describe('POST /admin/api/login', () => {
    function mockSupabaseToken(token: string): void {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: token, expires_in: 3600 }),
      }) as unknown as typeof fetch;
    }

    it('validates the request body', async () => {
      await request(app.getHttpServer())
        .post('/admin/api/login')
        .send({ email: 'nope' })
        .expect(400);
    });

    it('returns the session for an admin account', async () => {
      const token = adminToken();
      mockSupabaseToken(token);

      const res = await request(app.getHttpServer())
        .post('/admin/api/login')
        .send({ email: 'ops@example.com', password: 'pw' })
        .expect(200);

      expect(res.body.accessToken).toBe(token);
      expect(res.body.expiresAt).toBeGreaterThan(Date.now() / 1000);
    });

    it('refuses to hand out a session for a non-admin account', async () => {
      mockSupabaseToken(riderToken());

      const res = await request(app.getHttpServer())
        .post('/admin/api/login')
        .send({ email: 'rider@example.com', password: 'pw' })
        .expect(403);
      expect(res.body.accessToken).toBeUndefined();
    });

    it('returns 401 when Supabase rejects the credentials', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }) as unknown as typeof fetch;

      await request(app.getHttpServer())
        .post('/admin/api/login')
        .send({ email: 'ops@example.com', password: 'wrong' })
        .expect(401);
    });
  });
});
