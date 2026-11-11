import { Controller, Headers, Post, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { HookError, SendSmsHookService } from './send-sms-hook.service';

/**
 * POST /auth-hooks/send-sms: called by Supabase Auth, authenticated by its webhook signature.
 * Supabase expects 200 with {} on success, or {"error":{"http_code","message"}} on failure (the
 * message is shown to the person signing in).
 */
@SkipThrottle()
@Controller('auth-hooks')
export class SendSmsHookController {
  constructor(private readonly hook: SendSmsHookService) {}

  @Post('send-sms')
  async sendSms(
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
    @Headers('webhook-id') id?: string,
    @Headers('webhook-timestamp') timestamp?: string,
    @Headers('webhook-signature') signature?: string,
  ): Promise<void> {
    try {
      await this.hook.handle(req.rawBody ?? Buffer.from(''), { id, timestamp, signature });
      res.status(200).json({});
    } catch (err) {
      const code = err instanceof HookError ? err.httpCode : 500;
      const message = err instanceof HookError ? err.message : 'Could not send the SMS.';
      res.status(code).json({ error: { http_code: code, message } });
    }
  }
}
