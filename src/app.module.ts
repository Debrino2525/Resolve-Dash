import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CustomersModule } from './customers/customers.module';
import { throttleLimit, throttleTtlMs } from './common/throttle.config';
import { UserThrottlerGuard } from './common/user-throttler.guard';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { OrdersModule } from './orders/orders.module';
import { PlacesModule } from './places/places.module';
import { AuthHooksModule } from './auth-hooks/auth-hooks.module';
import { RidersModule } from './riders/riders.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    // Rate limit on every route, per signed-in account (or per IP without a valid token); routes
    // override with @Throttle / @SkipThrottle. Set TRUST_PROXY so the IP is the real client's.
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
    AuthHooksModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
