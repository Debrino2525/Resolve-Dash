import { Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { SubscriptionService } from '../subscriptions/subscription.service';

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
