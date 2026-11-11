import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { SendSmsHookController } from './send-sms-hook.controller';
import { SendSmsHookService } from './send-sms-hook.service';

/** Endpoints Supabase Auth calls (phone sign-in codes are delivered through mNotify). */
@Module({
  imports: [SmsModule],
  controllers: [SendSmsHookController],
  providers: [SendSmsHookService],
})
export class AuthHooksModule {}
