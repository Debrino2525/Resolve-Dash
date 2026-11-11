import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CustomersModule } from './customers/customers.module';
import { throttleLimit, throttleTtlMs } from './common/throttle.config';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { OrdersModule } from './orders/orders.module';
import { PlacesModule } from './places/places.module';
import { RidersModule } from './riders/riders.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    // Per-IP rate limit on every route; routes override with @Throttle / @SkipThrottle.
    // Behind a reverse proxy, set TRUST_PROXY so the limit applies per client, not per proxy.
    ThrottlerModule.forRoot([{ name: 'default', ttl: throttleTtlMs(), limit: throttleLimit() }]),
    DatabaseModule,
    AuthModule,
    BillingModule,
    RidersModule,
    SubscriptionsModule,
    WebhooksModule,
    AdminModule,
    CustomersModule,
    OrdersModule,
    PlacesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
