import { Module } from '@nestjs/common';
import { BillingModule } from './billing/billing.module';
import { DatabaseModule } from './database/database.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';

@Module({
  imports: [DatabaseModule, BillingModule, SubscriptionsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
