import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { DatabaseModule } from '../database/database.module';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionRepository } from './subscription.repository';
import { SubscriptionService } from './subscription.service';

@Module({
  imports: [DatabaseModule, BillingModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionRepository, SubscriptionService],
  exports: [SubscriptionService, SubscriptionRepository],
})
export class SubscriptionsModule {}
