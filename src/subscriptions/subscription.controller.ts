import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { SubscriptionService } from './subscription.service';

export interface InitializeCheckoutRequestBody {
  callbackUrl?: string;
}

export interface SubscriptionStatusResponse {
  status: string;
  trialEndsAt: string | null;
  paidUntil: string | null;
  graceEndsAt: string | null;
  canAcceptOrders: boolean;
  pricePesewas: number;
  serverTime: string;
}

export interface CheckoutSessionResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
  checkoutExpiresAt: string;
}

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  async getMySubscription(@CurrentUser() user: AuthUser): Promise<SubscriptionStatusResponse> {
    const result = await this.subscriptionService.getSubscriptionStatus(user.id);

    return {
      status: result.subscription?.status ?? 'SUSPENDED',
      trialEndsAt: result.subscription?.trialEndsAt?.toISOString() ?? null,
      paidUntil: result.subscription?.paidUntil?.toISOString() ?? null,
      graceEndsAt: result.subscription?.graceEndsAt?.toISOString() ?? null,
      canAcceptOrders: result.eligibility.canAccept,
      pricePesewas: 5000,
      serverTime: new Date().toISOString(),
    };
  }

  @Post('initialize')
  @UseGuards(SupabaseAuthGuard)
  async initializeCheckout(
    @CurrentUser() user: AuthUser,
    @Body() body: InitializeCheckoutRequestBody,
    @Req() req: Request,
  ): Promise<CheckoutSessionResponse> {
    const email = user.email || `rider_${user.id.slice(0, 8)}@ghanadash.local`;

    // Paystack strictly requires HTTP/HTTPS callback URLs.
    // Route through our backend HTTPS redirect bridge; custom schemes are rejected.
    const host = req.get('host') || 'localhost:3000';
    const protocol =
      req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const defaultBridge = `${protocol}://${host}/subscriptions/callback`;
    const clientCallback = body?.callbackUrl;
    const effectiveCallbackUrl =
      clientCallback &&
      (clientCallback.startsWith('http://') || clientCallback.startsWith('https://'))
        ? clientCallback
        : defaultBridge;

    const session = await this.subscriptionService.initializeCheckout(
      user.id,
      email,
      effectiveCallbackUrl,
    );

    return {
      authorizationUrl: session.authorizationUrl,
      accessCode: session.accessCode,
      reference: session.reference,
      checkoutExpiresAt: session.checkoutExpiresAt.toISOString(),
    };
  }

  /**
   * HTTPS redirect bridge for Paystack checkout return.
   * Redirects browser to mobile custom scheme ghanadash-rider://subscription-callback
   */
  @Get('callback')
  handleRedirectCallback(
    @Query('reference') reference: string | undefined,
    @Query('trxref') trxref: string | undefined,
    @Res() res: Response,
  ): void {
    const ref = reference || trxref || '';
    const deepLinkUrl = `ghanadash-rider://subscription-callback?reference=${encodeURIComponent(ref)}`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting to Ghana Dash...</title>
  <meta http-equiv="refresh" content="0;url=${deepLinkUrl}">
</head>
<body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
  <h2>Payment Complete</h2>
  <p>Returning you to the Rider app...</p>
  <p><a href="${deepLinkUrl}" style="display: inline-block; padding: 12px 24px; background: #00875A; color: white; border-radius: 6px; text-decoration: none;">Return to Ghana Dash</a></p>
  <script>window.location.href = "${deepLinkUrl}";</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.status(HttpStatus.OK).send(html);
  }
}
