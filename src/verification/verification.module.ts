import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { PhoneVerificationService } from './phone-verification.service';

/**
 * SMS one-time-code phone verification, shared by the rider and customer apps.
 * A single instance holds pending codes, so it must be provided once (here).
 */
@Module({
  imports: [SmsModule],
  providers: [PhoneVerificationService],
  exports: [PhoneVerificationService],
})
export class VerificationModule {}
