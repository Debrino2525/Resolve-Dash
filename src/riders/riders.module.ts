import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SupabaseStorageClient } from '../storage/supabase-storage.client';
import { VerificationModule } from '../verification/verification.module';
import { RiderDocumentsController } from './rider-documents.controller';
import { RiderDocumentsRepository } from './rider-documents.repository';
import { RiderDocumentsService } from './rider-documents.service';
import { RiderController } from './rider.controller';
import { RiderRepository } from './rider.repository';
import { RiderService } from './rider.service';

@Module({
  imports: [DatabaseModule, VerificationModule],
  controllers: [RiderController, RiderDocumentsController],
  providers: [
    RiderRepository,
    RiderService,
    RiderDocumentsRepository,
    RiderDocumentsService,
    SupabaseStorageClient,
  ],
  exports: [RiderService, RiderRepository, RiderDocumentsService],
})
export class RidersModule {}
