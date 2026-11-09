import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [SubscriptionsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
