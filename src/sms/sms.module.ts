import { Logger, Module } from '@nestjs/common';
import { MnotifyProvider, maskPhone } from './mnotify.provider';
import { ISmsProvider, SMS_PROVIDER_TOKEN } from './sms.interface';

/**
 * Development-only provider: prints the message (including OTP codes) to the server log
 * instead of sending it, so sign-up can be tested without SMS credit. Never used in production.
 */
export class ConsoleSmsProvider implements ISmsProvider {
  private readonly logger = new Logger('DevSms');

  async send(phoneE164: string, message: string): Promise<void> {
    this.logger.warn(`[DEV — not sent] SMS to ${maskPhone(phoneE164)}: ${message}`);
  }
}

export function createSmsProvider(env: NodeJS.ProcessEnv = process.env): ISmsProvider {
  const apiKey = env.MNOTIFY_API_KEY?.trim();
  const senderId = env.MNOTIFY_SENDER_ID?.trim();
  if (apiKey && senderId) {
    return new MnotifyProvider({ apiKey, senderId });
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('MNOTIFY_API_KEY and MNOTIFY_SENDER_ID must be set in production');
  }
  new Logger('SmsModule').warn(
    'MNOTIFY_API_KEY/MNOTIFY_SENDER_ID not set: OTP codes will be printed to this log, not sent.',
  );
  return new ConsoleSmsProvider();
}

@Module({
  providers: [{ provide: SMS_PROVIDER_TOKEN, useFactory: (): ISmsProvider => createSmsProvider() }],
  exports: [SMS_PROVIDER_TOKEN],
})
export class SmsModule {}
