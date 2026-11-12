import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as crypto from 'crypto';
import helmet from 'helmet';
import request from 'supertest';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import { AdminGuard } from '../src/auth/admin.guard';
import { AdminInsightsService } from '../src/admin/admin-insights.service';
import { AdminOperationsService } from '../src/admin/admin-operations.service';
import { AdminDeliveryService } from '../src/orders/admin-delivery.service';
import { RiderDocumentsService } from '../src/riders/rider-documents.service';
import { SupabaseAuthGuard } from '../src/auth/supabase-auth.guard';

describe('Admin portal E2E (auth lockdown)', () => {
  let app: INestApplication;
  let mockAdminService: jest.Mocked<AdminService>;
  const mockInsights = {
    getDashboard: jest.fn(),
    getRiderDetail: jest.fn(),
    listPayments: jest.fn(),
  } as unknown as jest.Mocked<AdminInsightsService>;
  const mockOperations = {
    listDeliveries: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 }),
    getDelivery: jest.fn().mockResolvedValue({ id: 'x' }),
    listCustomers: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 }),
    getCustomer: jest.fn().mockResolvedValue({ id: 'x' }),
    getLive: jest.fn().mockResolvedValue({ generatedAt: 'now', riders: [], deliveries: [] }),
  } as unknown as jest.Mocked<AdminOperationsService>;
  const mockDeliveries = {
    markDelivered: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AdminDeliveryService>;
  const mockDocuments = {
    getChecklistForAdmin: jest.fn(),
    readFileForAdmin: jest.fn(),
    review: jest.fn(),
  } as unknown as jest.Mocked<RiderDocumentsService>;
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
      getOverview: jest.fn().mockResolvedValue({
        stats: { totalRiders: 1, pendingVerification: 1, activeRiders: 0, activeSubscriptions: 0 },
        riders: [],
      }),
      approveRider: jest.fn().mockResolvedValue({ id: RIDER_ID }),
      rejectRider: jest.fn().mockResolvedValue({ id: RIDER_ID }),
      grantSubscriptionAccess: jest.fn().mockResolvedValue({ id: RIDER_ID }),
    } as unknown as jest.Mocked<AdminService>;

    @Module({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
        { provide: AdminInsightsService, useValue: mockInsights },
        { provide: AdminOperationsService, useValue: mockOperations },
        { provide: AdminDeliveryService, useValue: mockDeliveries },
        { provide: RiderDocumentsService, useValue: mockDocuments },
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
    expect(mockAdminService.getOverview).not.toHaveBeenCalled();
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
    expect(mockAdminService.approveRider).toHaveBeenCalledWith(
      RIDER_ID,
      '55555555-5555-5555-5555-555555555555',
    );
  });

  describe('portal data endpoints', () => {
    it.each(['/admin/api/dashboard', `/admin/api/riders/${RIDER_ID}`, '/admin/api/payments'])(
      'GET %s requires an admin',
      async (path) => {
        await request(app.getHttpServer()).get(path).expect(401);
        await request(app.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${riderToken()}`)
          .expect(403);
      },
    );

    it('serves the dashboard to admins', async () => {
      mockInsights.getDashboard.mockResolvedValue({ stats: { totalRiders: 3 } } as never);
      const res = await request(app.getHttpServer())
        .get('/admin/api/dashboard')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(res.body.stats.totalRiders).toBe(3);
    });

    it('passes the payment status filter through, upper-cased', async () => {
      mockInsights.listPayments.mockResolvedValue([]);
      await request(app.getHttpServer())
        .get('/admin/api/payments?status=failed')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(mockInsights.listPayments).toHaveBeenCalledWith('FAILED');
    });

    it('records the reject reason', async () => {
      mockAdminService.rejectRider.mockResolvedValue({ id: RIDER_ID } as never);
      await request(app.getHttpServer())
        .post(`/admin/api/riders/${RIDER_ID}/reject`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ reason: 'Ghana Card could not be verified' })
        .expect(201);
      expect(mockAdminService.rejectRider).toHaveBeenCalledWith(
        RIDER_ID,
        '55555555-5555-5555-5555-555555555555',
        'Ghana Card could not be verified',
      );
    });

    it('serves the portal stylesheet', async () => {
      const res = await request(app.getHttpServer()).get('/admin/app.css').expect(200);
      expect(res.headers['content-type']).toContain('text/css');
    });
  });

  describe('document review endpoints', () => {
    const DOC = '66666666-6666-6666-6666-666666666666';

    it.each([
      ['GET', `/admin/api/riders/${RIDER_ID}/documents`],
      ['GET', `/admin/api/riders/${RIDER_ID}/documents/${DOC}/file`],
      ['POST', `/admin/api/riders/${RIDER_ID}/documents/${DOC}/review`],
    ])('%s %s requires an admin', async (method, path) => {
      const server = request(app.getHttpServer());
      const call = method === 'GET' ? server.get(path) : server.post(path);
      await call.expect(401);
      const asRider =
        method === 'GET'
          ? request(app.getHttpServer()).get(path)
          : request(app.getHttpServer()).post(path);
      await asRider.set('Authorization', `Bearer ${riderToken()}`).expect(403);
    });

    it("streams a document file using the admin's own token", async () => {
      mockDocuments.readFileForAdmin.mockResolvedValue({
        body: Buffer.from([0xff, 0xd8, 0xff]),
        contentType: 'image/jpeg',
      });
      const token = adminToken();
      const res = await request(app.getHttpServer())
        .get(`/admin/api/riders/${RIDER_ID}/documents/${DOC}/file`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(mockDocuments.readFileForAdmin).toHaveBeenCalledWith(RIDER_ID, DOC, token);
    });

    it('validates the review decision', async () => {
      await request(app.getHttpServer())
        .post(`/admin/api/riders/${RIDER_ID}/documents/${DOC}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ decision: 'MAYBE' })
        .expect(400);
      expect(mockDocuments.review).not.toHaveBeenCalled();
    });

    it('passes the reviewing admin id through', async () => {
      mockDocuments.review.mockResolvedValue({
        items: [],
        submittedCount: 0,
        approvedCount: 0,
        requiredCount: 4,
      });
      await request(app.getHttpServer())
        .post(`/admin/api/riders/${RIDER_ID}/documents/${DOC}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ decision: 'REJECTED', note: 'Blurry photo' })
        .expect(200);
      expect(mockDocuments.review).toHaveBeenCalledWith(
        RIDER_ID,
        DOC,
        'REJECTED',
        'Blurry photo',
        '55555555-5555-5555-5555-555555555555',
      );
    });
  });

  describe('deliveries, customers and live map', () => {
    const ORDER_ID = '66666666-6666-6666-6666-666666666666';
    const readRoutes = [
      '/admin/api/deliveries',
      `/admin/api/deliveries/${ORDER_ID}`,
      '/admin/api/customers',
      `/admin/api/customers/${ORDER_ID}`,
      '/admin/api/live',
      '/admin/api/config',
    ];

    it.each(readRoutes)('requires an admin for GET %s', async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${riderToken()}`)
        .expect(403);
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
    });

    it('passes parsed filters to the service and ignores junk', async () => {
      await request(app.getHttpServer())
        .get('/admin/api/deliveries?status=active&q=GD-AB&page=2')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(mockOperations.listDeliveries).toHaveBeenLastCalledWith({
        filter: 'ACTIVE',
        q: 'GD-AB',
        page: 2,
      });
      await request(app.getHttpServer())
        .get('/admin/api/deliveries?status=bogus&status=x&page=-1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);
      expect(mockOperations.listDeliveries).toHaveBeenLastCalledWith({
        filter: null,
        q: undefined,
        page: 1,
      });
    });

    it('lets support close a stuck delivery, with a reason and their admin id', async () => {
      const id = '66666666-6666-6666-6666-666666666666';
      await request(app.getHttpServer())
        .post(`/admin/api/deliveries/${id}/complete`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ reason: 'Customer confirmed by phone' })
        .expect(200);
      expect(mockDeliveries.markDelivered).toHaveBeenCalledWith(
        id,
        '55555555-5555-5555-5555-555555555555',
        'Customer confirmed by phone',
      );
      await request(app.getHttpServer())
        .post(`/admin/api/deliveries/${id}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ reason: 'Rider unreachable' })
        .expect(200);
      expect(mockDeliveries.cancel).toHaveBeenCalledWith(
        id,
        '55555555-5555-5555-5555-555555555555',
        'Rider unreachable',
      );
    });

    it('requires a reason and an admin to close a delivery', async () => {
      const id = '66666666-6666-6666-6666-666666666666';
      await request(app.getHttpServer())
        .post(`/admin/api/deliveries/${id}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({})
        .expect(400);
      await request(app.getHttpServer())
        .post(`/admin/api/deliveries/${id}/complete`)
        .set('Authorization', `Bearer ${riderToken()}`)
        .send({ reason: 'I delivered it' })
        .expect(403);
    });

    it('rejects non-UUID order and customer ids with 400', async () => {
      for (const path of ['/admin/api/deliveries/GD-ABC123', '/admin/api/customers/nope']) {
        await request(app.getHttpServer())
          .get(path)
          .set('Authorization', `Bearer ${adminToken()}`)
          .expect(400);
      }
    });

    it('only hands out a public pk.* Mapbox token', async () => {
      const original = process.env.ADMIN_MAPBOX_PUBLIC_TOKEN;
      try {
        process.env.ADMIN_MAPBOX_PUBLIC_TOKEN = 'sk.secret-token';
        const secret = await request(app.getHttpServer())
          .get('/admin/api/config')
          .set('Authorization', `Bearer ${adminToken()}`)
          .expect(200);
        expect(secret.body).toEqual({ mapboxToken: null });

        process.env.ADMIN_MAPBOX_PUBLIC_TOKEN = 'pk.public-token';
        const pub = await request(app.getHttpServer())
          .get('/admin/api/config')
          .set('Authorization', `Bearer ${adminToken()}`)
          .expect(200);
        expect(pub.body).toEqual({ mapboxToken: 'pk.public-token' });
      } finally {
        if (original === undefined) delete process.env.ADMIN_MAPBOX_PUBLIC_TOKEN;
        else process.env.ADMIN_MAPBOX_PUBLIC_TOKEN = original;
      }
    });
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
