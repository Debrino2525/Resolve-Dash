import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AdminAuthService } from './admin-auth.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuthService],
  exports: [AdminService],
})
export class AdminModule {}
