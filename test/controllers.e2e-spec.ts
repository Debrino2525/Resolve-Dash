import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as crypto from 'crypto';
import request from 'supertest';
import { SupabaseAuthGuard } from '../src/auth/supabase-auth.guard';
import { Rider } from '../src/domain/types/rider';
import { RiderController } from '../src/riders/rider.controller';
import { RiderService } from '../src/riders/rider.service';
import { SubscriptionController } from '../src/subscriptions/subscription.controller';
import { SubscriptionService } from '../src/subscriptions/subscription.service';
import { WebhooksController } from '../src/webhooks/webhooks.controller';

describe('Controllers E2E Integration', () => {
  let app: INestApplication;
  let mockRiderService: jest.Mocked<RiderService>;
  let mockSubscriptionService: jest.Mocked<SubscriptionService>;
  const TEST_SECRET = 'e2e-test-secret-key-12345';

  const MOCK_USER = {
    id: '33333333-3333-3333-3333-333333333333',
    phoneNumber: '+233201234567',
    email: 'kofi@example.com',
    role: 'rider',
  };

  function createTestJwt(): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: MOCK_USER.id,
        phone: MOCK_USER.phoneNumber,
        email: MOCK_USER.email,
        exp: Math.floor(Date.now() / 1000) + 3600,
        app_metadata: { role: 'rider' },
      }),
    ).toString('base64url');
    const signature = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');
    return `${header}.${payload}.${signature}`;
  }

  beforeAll(async () => {
    process.env.SUPABASE_JWT_SECRET = TEST_SECRET;

    mockRiderService = {
      onboard: jest.fn(),
      getProfile: jest.fn(),
    } as unknown as jest.Mocked<RiderService>;

    mockSubscriptionService = {
      getSubscriptionStatus: jest.fn(),
      initializeCheckout: jest.fn(),
      handleWebhook: jest.fn(),
    } as unknown as jest.Mocked<SubscriptionService>;

    @Module({
      controllers: [RiderController, SubscriptionController, WebhooksController],
      providers: [
        { provide: RiderService, useValue: mockRiderService },
        { provide: SubscriptionService, useValue: mockSubscriptionService },
        SupabaseAuthGuard,
      ],
    })
    class TestControllerAppModule {}

    app = await NestFactory.create(TestControllerAppModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /riders/onboard', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .post('/riders/onboard')
        .send({ fullName: 'Kofi Mensah' })
        .expect(401);
    });

    it('creates rider profile and returns RiderProfile shape', async () => {
      const mockRider: Rider = {
        id: MOCK_USER.id,
        phoneNumber: MOCK_USER.phoneNumber,
        email: MOCK_USER.email,
        fullName: 'Kofi Mensah',
        onboardingStatus: 'PENDING_VERIFICATION',
        createdAt: new Date('2026-11-09T10:00:00Z'),
        updatedAt: new Date('2026-11-09T10:00:00Z'),
      };

      mockRiderService.onboard.mockResolvedValue(mockRider);

      const token = createTestJwt();
      const res = await request(app.getHttpServer())
        .post('/riders/onboard')
        .set('Authorization', `Bearer ${token}`)
        .send({ fullName: 'Kofi Mensah' })
        .expect(201);

      expect(res.body).toEqual({
        id: MOCK_USER.id,
        phoneNumber: MOCK_USER.phoneNumber,
        fullName: 'Kofi Mensah',
        onboardingStatus: 'PENDING_VERIFICATION',
        createdAt: '2026-11-09T10:00:00.000Z',
      });
    });
  });

  describe('GET /riders/me', () => {
    it('returns authenticated rider profile', async () => {
      mockRiderService.getProfile.mockResolvedValue({
        id: MOCK_USER.id,
        phoneNumber: MOCK_USER.phoneNumber,
        email: MOCK_USER.email,
        fullName: 'Kofi Mensah',
        onboardingStatus: 'ACTIVE',
        createdAt: new Date('2026-11-09T10:00:00Z'),
        updatedAt: new Date('2026-11-09T10:00:00Z'),
      });

      const token = createTestJwt();
      const res = await request(app.getHttpServer())
        .get('/riders/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.onboardingStatus).toBe('ACTIVE');
      expect(res.body.fullName).toBe('Kofi Mensah');
    });
  });

  describe('GET /subscriptions/me', () => {
    it('returns subscription status, dispatch eligibility, and serverTime', async () => {
      mockSubscriptionService.getSubscriptionStatus.mockResolvedValue({
        subscription: {
          id: 'sub-123',
          riderId: MOCK_USER.id,
          status: 'ACTIVE',
          trialEndsAt: null,
          paidUntil: new Date('2026-11-16T12:00:00Z'),
          graceEndsAt: null,
          trialUsed: true,
          remindersSent: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        eligibility: {
          canAccept: true,
          isMidTrip: false,
          effectiveStatus: 'ACTIVE',
        },
      });

      const token = createTestJwt();
      const res = await request(app.getHttpServer())
        .get('/subscriptions/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.canAcceptOrders).toBe(true);
      expect(res.body.pricePesewas).toBe(5000);
      expect(res.body.paidUntil).toBe('2026-11-16T12:00:00.000Z');
      expect(res.body.serverTime).toBeDefined();
    });
  });

  describe('POST /subscriptions/initialize', () => {
    it('initializes checkout and returns checkout session response', async () => {
      mockSubscriptionService.initializeCheckout.mockResolvedValue({
        authorizationUrl: 'https://checkout.paystack.com/access-123',
        accessCode: 'access-123',
        reference: 'sub_12345',
        checkoutExpiresAt: new Date('2026-11-09T13:00:00Z'),
      });

      const token = createTestJwt();
      const res = await request(app.getHttpServer())
        .post('/subscriptions/initialize')
        .set('Authorization', `Bearer ${token}`)
        .send({ callbackUrl: 'ghanadash-rider://subscription-callback' })
        .expect(201);

      expect(res.body).toEqual({
        authorizationUrl: 'https://checkout.paystack.com/access-123',
        accessCode: 'access-123',
        reference: 'sub_12345',
        checkoutExpiresAt: '2026-11-09T13:00:00.000Z',
      });
    });
  });

  describe('GET /subscriptions/callback', () => {
    it('returns HTML bridge launcher redirecting to custom scheme', async () => {
      const res = await request(app.getHttpServer())
        .get('/subscriptions/callback?reference=sub_ref_999')
        .expect(200);

      expect(res.text).toContain('ghanadash-rider://subscription-callback?reference=sub_ref_999');
    });
  });

  describe('POST /webhooks/paystack', () => {
    it('forwards raw body and signature header to SubscriptionService', async () => {
      mockSubscriptionService.handleWebhook.mockResolvedValue({
        received: true,
        credited: true,
      });

      const res = await request(app.getHttpServer())
        .post('/webhooks/paystack')
        .set('x-paystack-signature', 'test-sig-123')
        .send({ event: 'charge.success', data: { reference: 'ref-1' } })
        .expect(200);

      expect(res.body).toEqual({ received: true, credited: true });
      expect(mockSubscriptionService.handleWebhook).toHaveBeenCalled();
    });
  });
});
