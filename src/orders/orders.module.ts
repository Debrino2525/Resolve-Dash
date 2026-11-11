import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { DatabaseModule } from '../database/database.module';
import { SupabaseStorageClient } from '../storage/supabase-storage.client';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DispatchService } from './dispatch.service';
import { OrderMediaController } from './order-media.controller';
import { OrderMediaService } from './order-media.service';
import { OrderController } from './order.controller';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { RiderDispatchController } from './rider-dispatch.controller';
import { RiderDispatchService } from './rider-dispatch.service';

@Module({
  imports: [DatabaseModule, CustomersModule, SubscriptionsModule],
  controllers: [OrderController, OrderMediaController, RiderDispatchController],
  providers: [
    OrderRepository,
    OrderService,
    OrderMediaService,
    DispatchService,
    RiderDispatchService,
    SupabaseStorageClient,
  ],
  exports: [OrderRepository],
})
export class OrdersModule {}
