import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import * as crypto from 'crypto';
import request from 'supertest';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import { AdminGuard } from '../src/auth/admin.guard';
import { AdminInsightsService } from '../src/admin/admin-insights.service';
import { AdminOperationsService } from '../src/admin/admin-operations.service';
import { RiderDocumentsService } from '../src/riders/rider-documents.service';
import { SupabaseAuthGuard } from '../src/auth/supabase-auth.guard';
import { SubscriptionService } from '../src/subscriptions/subscription.service';
import { WebhooksController } from '../src/webhooks/webhooks.controller';
import { UserThrottlerGuard } from '../src/common/user-throttler.guard';
import { AdminDeliveryService } from '../src/orders/admin-delivery.service';

describe('Rate limiting E2E', () => {
  let app: INestApplication;
  const originalFetch = globalThis.fetch;
  const handleWebhook = jest.fn().mockResolvedValue({ received: true });

  beforeAll(async () => {
    // The admin login limit (AUTH_THROTTLE_LIMIT, default 5/min) is read at decoration time.
    process.env.SUPABASE_ANON_KEY = 'anon-test-key';
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    @Module({
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }])],
      controllers: [AdminController, WebhooksController],
      providers: [
        { provide: AdminService, useValue: {} },
        { provide: AdminInsightsService, useValue: {} },
        { provide: AdminOperationsService, useValue: {} },
        { provide: AdminDeliveryService, useValue: {} },
        { provide: RiderDocumentsService, useValue: {} },
        { provide: SubscriptionService, useValue: { handleWebhook } },
        { provide: APP_GUARD, useClass: UserThrottlerGuard },
        AdminAuthService,
        SupabaseAuthGuard,
        AdminGuard,
      ],
    })
    class TestThrottleModule {}

    app = await NestFactory.create(TestThrottleModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    await app.close();
  });

  it('limits admin login attempts to 5 per minute per IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(app.getHttpServer())
        .post('/admin/api/login')
        .send({ email: 'ops@example.com', password: `guess-${i}` });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });

  it('counts signed-in requests per account, so people sharing a mobile IP are not blocked', async () => {
    process.env.SUPABASE_JWT_SECRET = 'throttle-e2e-secret';
    const token = (sub: string, secret = 'throttle-e2e-secret'): string => {
      const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const p = Buffer.from(
        JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600, app_metadata: {} }),
      ).toString('base64url');
      const s = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
      return `${h}.${p}.${s}`;
    };
    const hit = (auth?: string): Promise<number> =>
      request(app.getHttpServer())
        .get('/admin/api/riders')
        .set('Authorization', auth ? `Bearer ${auth}` : '')
        .then((r) => r.status);

    const ama = token('11111111-1111-1111-1111-111111111111');
    const kofi = token('22222222-2222-2222-2222-222222222222');
    // Limit is 100 per minute in this module; Ama uses all of hers (403: not an admin).
    for (let i = 0; i < 100; i++) expect(await hit(ama)).toBe(403);
    expect(await hit(ama)).toBe(429);
    // Kofi, on the same IP, is unaffected.
    expect(await hit(kofi)).toBe(403);
    // A forged token naming Kofi doesn't touch his budget: it counts against the IP and fails.
    const forged = token('22222222-2222-2222-2222-222222222222', 'wrong-secret');
    expect(await hit(forged)).toBe(401);
    expect(await hit(kofi)).toBe(403);
  });

  it('never throttles Paystack webhooks', async () => {
    for (let i = 0; i < 120; i++) {
      await request(app.getHttpServer())
        .post('/webhooks/paystack')
        .set('x-paystack-signature', 'sig')
        .send({ event: 'charge.success' })
        .expect(200);
    }
    expect(handleWebhook).toHaveBeenCalledTimes(120);
  });
});
