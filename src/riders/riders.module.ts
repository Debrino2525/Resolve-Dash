import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RiderController } from './rider.controller';
import { RiderRepository } from './rider.repository';
import { RiderService } from './rider.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RiderController],
  providers: [RiderRepository, RiderService],
  exports: [RiderService, RiderRepository],
})
export class RidersModule {}
