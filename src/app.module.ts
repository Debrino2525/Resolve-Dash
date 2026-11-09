import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { DatabaseModule } from './database/database.module';
import { RidersModule } from './riders/riders.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BillingModule,
    RidersModule,
    SubscriptionsModule,
    WebhooksModule,
    AdminModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
