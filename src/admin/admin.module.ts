import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OrdersModule } from '../orders/orders.module';
import { RidersModule } from '../riders/riders.module';
import { AdminAuthService } from './admin-auth.service';
import { AdminInsightsService } from './admin-insights.service';
import { AdminOperationsService } from './admin-operations.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [DatabaseModule, RidersModule, OrdersModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuthService, AdminInsightsService, AdminOperationsService],
  exports: [AdminService],
})
export class AdminModule {}
