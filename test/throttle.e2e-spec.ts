import { INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AdminAuthService } from '../src/admin/admin-auth.service';
import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import { AdminGuard } from '../src/auth/admin.guard';
import { SupabaseAuthGuard } from '../src/auth/supabase-auth.guard';
import { SubscriptionService } from '../src/subscriptions/subscription.service';
import { WebhooksController } from '../src/webhooks/webhooks.controller';

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
        { provide: SubscriptionService, useValue: { handleWebhook } },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
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
