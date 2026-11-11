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
import { SubscriptionService, WEEKLY_SUBSCRIPTION_PESEWAS } from './subscription.service';

export interface InitializeCheckoutRequestBody {
  callbackUrl?: string;
}

export interface SubscriptionStatusResponse {
  status: string;
  trialEndsAt: string | null;
  paidUntil: string | null;
  graceEndsAt: string | null;
  canAcceptOrders: boolean;
  /** Why canAcceptOrders is false: RIDER_NOT_APPROVED | SUBSCRIPTION_EXPIRED | NO_SUBSCRIPTION_FOUND. */
  ineligibleReason: string | null;
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
      status: result.eligibility.effectiveStatus,
      trialEndsAt: result.subscription?.trialEndsAt?.toISOString() ?? null,
      paidUntil: result.subscription?.paidUntil?.toISOString() ?? null,
      graceEndsAt: result.eligibility.graceEndsAt?.toISOString() ?? null,
      canAcceptOrders: result.eligibility.canAccept,
      ineligibleReason: result.eligibility.reason ?? null,
      pricePesewas: WEEKLY_SUBSCRIPTION_PESEWAS,
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
    // Production: always the configured HTTPS bridge, never a client-chosen URL or one built
    // from the (spoofable) Host header. Development keeps the old flexibility for testing.
    const configured = process.env.PAYSTACK_CALLBACK_URL?.trim();
    const clientCallback = body?.callbackUrl;
    const clientAllowed =
      process.env.NODE_ENV !== 'production' &&
      !!clientCallback &&
      (clientCallback.startsWith('http://') || clientCallback.startsWith('https://'));
    const effectiveCallbackUrl =
      process.env.NODE_ENV === 'production' && configured
        ? configured
        : clientAllowed
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
</body>
</html>`;

    // No inline script: Helmet's CSP (script-src 'self') blocks it. The meta refresh and the
    // link both work without JavaScript.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(HttpStatus.OK).send(html);
  }
}
