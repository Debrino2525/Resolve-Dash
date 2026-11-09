import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { DatabaseModule } from './database/database.module';
import { RidersModule } from './riders/riders.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';

@Module({
  imports: [DatabaseModule, AuthModule, BillingModule, RidersModule, SubscriptionsModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
