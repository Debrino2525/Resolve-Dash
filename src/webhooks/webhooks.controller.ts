import { Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { SubscriptionService } from '../subscriptions/subscription.service';

// Paystack delivers (and retries) from shared IPs; authenticity is enforced by the HMAC signature.
@SkipThrottle()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  async handlePaystackWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-paystack-signature') signature: string,
  ): Promise<{ received: boolean; duplicate?: boolean; credited?: boolean }> {
    const rawBody = req.rawBody ?? Buffer.from('');
    return this.subscriptionService.handleWebhook(rawBody, signature || '');
  }
}
