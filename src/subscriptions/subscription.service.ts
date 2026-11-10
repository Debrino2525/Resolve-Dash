import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { BILLING_PROVIDER_TOKEN, IBillingProvider } from '../billing/billing.interface';
import { DatabaseService } from '../database/database.service';
import { GHS_CURRENCY, toPesewas } from '../domain/types/money';
import { CheckoutSession, SubscriptionPayment } from '../domain/types/payment';
import { DispatchEligibilityResult, Subscription } from '../domain/types/subscription';
import { deriveWebhookDedupeKey, PaystackWebhookEnvelope } from '../domain/types/webhook';
import { SubscriptionRepository } from './subscription.repository';

export const WEEKLY_SUBSCRIPTION_PESEWAS = toPesewas(5000); // GH₵50.00
export const CHECKOUT_EXPIRATION_MINUTES = 30;

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly repository: SubscriptionRepository,
    @Inject(BILLING_PROVIDER_TOKEN)
    private readonly billingProvider: IBillingProvider,
  ) {}

  /**
   * Initializes a checkout session for a rider.
   * Enforces the single-pending-payment rule:
   * - If an unexpired pending session exists, returns the existing checkout session.
   * - If a stale pending session exists, authoritatively checks Paystack before marking FAILED.
   * - Creates a new pending payment record with collision-resistant reference.
   */
  async initializeCheckout(
    riderId: string,
    email: string,
    callbackUrl?: string,
  ): Promise<CheckoutSession> {
    const existingPending = await this.repository.findPendingPaymentByRiderId(riderId);
    const now = new Date();

    if (existingPending) {
      const accessCode = existingPending.paystackAccessCode;
      if (accessCode && now.getTime() < existingPending.checkoutExpiresAt.getTime()) {
        // Active pending checkout exists: Paystack's hosted page lives at /<access_code>
        return {
          authorizationUrl: `https://checkout.paystack.com/${encodeURIComponent(accessCode)}`,
          accessCode,
          reference: existingPending.reference,
          checkoutExpiresAt: existingPending.checkoutExpiresAt,
        };
      }

      // Expired (or has no access code, so no usable checkout URL can be rebuilt):
      // verify with Paystack first before failing
      try {
        const verification = await this.billingProvider.verifyTransaction(
          existingPending.reference,
        );
        if (verification.status === 'success') {
          // Rider completed payment on gateway right before expiration: credit it now
          await this.creditSuccessfulPayment(existingPending, verification);
          throw new ConflictException(
            'Previous pending payment was already completed on gateway. Subscription is now active.',
          );
        }
      } catch (verifyErr) {
        if (verifyErr instanceof ConflictException) throw verifyErr;
        // Verification failed or was unpaid, safe to mark stale payment as FAILED
        this.logger.debug(
          `Stale pending payment ${existingPending.reference} was not paid; marking FAILED`,
        );
      }

      await this.repository.markPaymentFailed(existingPending.reference, 'EXPIRED_UNPAID');
    }

    // Generate unique reference
    const reference = `sub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const checkoutExpiresAt = new Date(now.getTime() + CHECKOUT_EXPIRATION_MINUTES * 60 * 1000);

    const initResult = await this.billingProvider.initializeTransaction({
      reference,
      email,
      amountPesewas: WEEKLY_SUBSCRIPTION_PESEWAS,
      currency: GHS_CURRENCY,
      callbackUrl,
    });

    await this.repository.createPendingPayment({
      riderId,
      reference: initResult.reference,
      paystackAccessCode: initResult.accessCode,
      checkoutExpiresAt,
      amountPesewas: WEEKLY_SUBSCRIPTION_PESEWAS,
      currency: GHS_CURRENCY,
    });

    return {
      authorizationUrl: initResult.authorizationUrl,
      accessCode: initResult.accessCode,
      reference: initResult.reference,
      checkoutExpiresAt,
    };
  }

  /**
   * Authoritatively handles incoming Paystack webhook requests.
   * Verifies raw-body HMAC-SHA512, enforces idempotency deduplication, and
   * credits subscriptions in a locked database transaction.
   */
  async handleWebhook(
    rawBody: Buffer,
    signatureHeader: string,
  ): Promise<{ received: boolean; duplicate?: boolean; credited?: boolean }> {
    const isValid = this.billingProvider.verifyWebhookSignature(rawBody, signatureHeader);
    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let envelope: PaystackWebhookEnvelope;
    try {
      envelope = JSON.parse(rawBody.toString('utf8')) as PaystackWebhookEnvelope;
    } catch {
      throw new UnauthorizedException('Invalid JSON payload');
    }

    if (!envelope?.event || !envelope.data) {
      throw new UnauthorizedException('Invalid webhook payload');
    }

    const dedupeKey = deriveWebhookDedupeKey(envelope);
    const payload = envelope as unknown as Record<string, unknown>;

    // Fast path: skip the gateway round-trip for events we have already processed.
    if (await this.repository.webhookEventExists(dedupeKey)) {
      this.logger.warn(`Duplicate webhook received with dedupeKey: ${dedupeKey}`);
      return { received: true, duplicate: true };
    }

    if (envelope.event !== 'charge.success') {
      // No side effects for other events: just record them for audit/dedupe.
      const isNew = await this.repository.recordWebhookEventIfNotExists(
        dedupeKey,
        envelope.event,
        payload,
      );
      return isNew ? { received: true } : { received: true, duplicate: true };
    }

    const reference = envelope.data.reference;
    if (!reference) {
      this.logger.error('charge.success webhook missing transaction reference');
      return { received: true, credited: false };
    }

    // Query gateway authoritatively to verify exact amount and status.
    // Any throw from here on leaves the dedupe key unrecorded, so Paystack's retry is processed.
    const verification = await this.billingProvider.verifyTransaction(reference);
    if (verification.status !== 'success') {
      this.logger.warn(
        `Gateway reported non-success status for ref ${reference}: ${verification.status}`,
      );
      return { received: true, credited: false };
    }

    if (verification.currency !== GHS_CURRENCY) {
      this.logger.error(`Payment ${reference} settled in ${verification.currency}, expected GHS`);
      await this.repository.recordWebhookEventIfNotExists(dedupeKey, envelope.event, payload);
      return { received: true, credited: false };
    }

    if (verification.amountPesewas < WEEKLY_SUBSCRIPTION_PESEWAS) {
      this.logger.error(
        `Payment amount ${verification.amountPesewas} pesewas is less than required ${WEEKLY_SUBSCRIPTION_PESEWAS}`,
      );
      await this.repository.recordWebhookEventIfNotExists(dedupeKey, envelope.event, payload);
      return { received: true, credited: false };
    }

    const payment = await this.repository.findPaymentByReference(reference);
    if (!payment) {
      this.logger.error(`No payment record found for reference ${reference}`);
      throw new NotFoundException(`Payment record not found for reference: ${reference}`);
    }

    // Record the dedupe key and credit in ONE transaction: if crediting fails the key is
    // rolled back too, so the event is never marked processed without the rider being credited.
    const outcome = await this.creditSuccessfulPayment(payment, verification, {
      dedupeKey,
      eventType: envelope.event,
      payload,
    });

    if (outcome === 'duplicate') {
      this.logger.warn(`Duplicate webhook received with dedupeKey: ${dedupeKey}`);
      return { received: true, duplicate: true };
    }
    return { received: true, credited: true };
  }

  /**
   * Retrieves subscription state and calculates authoritative dispatch eligibility.
   */
  async getSubscriptionStatus(
    riderId: string,
  ): Promise<{ subscription: Subscription | null; eligibility: DispatchEligibilityResult }> {
    const subscription = await this.repository.findSubscriptionByRiderId(riderId);
    if (!subscription) {
      return {
        subscription: null,
        eligibility: {
          canAccept: false,
          reason: 'NO_SUBSCRIPTION_FOUND',
          isMidTrip: false,
          effectiveStatus: 'SUSPENDED',
        },
      };
    }

    const now = new Date();
    const trialEnd = subscription.trialEndsAt ? subscription.trialEndsAt.getTime() : 0;
    const paidUntil = subscription.paidUntil ? subscription.paidUntil.getTime() : 0;
    const graceEnd = subscription.graceEndsAt ? subscription.graceEndsAt.getTime() : 0;
    const nowTime = now.getTime();

    const maxCovered = Math.max(trialEnd, paidUntil);
    const inGrace = subscription.status === 'GRACE_PERIOD' && nowTime < graceEnd;
    const canAccept = nowTime < maxCovered || inGrace;

    let reason: string | undefined;
    if (!canAccept) {
      reason = 'SUBSCRIPTION_EXPIRED';
    }

    return {
      subscription,
      eligibility: {
        canAccept,
        reason,
        isMidTrip: false,
        effectiveStatus: subscription.status,
      },
    };
  }

  private async creditSuccessfulPayment(
    payment: SubscriptionPayment,
    verification: {
      paystackTransactionId: string;
      channel: string;
      amountPesewas: typeof WEEKLY_SUBSCRIPTION_PESEWAS;
      paidAt: Date | null;
    },
    webhookEvent?: { dedupeKey: string; eventType: string; payload: Record<string, unknown> },
  ): Promise<'credited' | 'already_credited' | 'duplicate'> {
    return this.db.withTransaction(async (client) => {
      if (webhookEvent) {
        const isNew = await this.repository.recordWebhookEventInTransaction(
          client,
          webhookEvent.dedupeKey,
          webhookEvent.eventType,
          webhookEvent.payload,
        );
        if (!isNew) return 'duplicate';
      }

      const result = await this.repository.creditSubscriptionInTransaction(client, {
        riderId: payment.riderId,
        reference: payment.reference,
        paystackTransactionId: verification.paystackTransactionId,
        channel: verification.channel,
        amountPesewas: verification.amountPesewas,
        paidAt: verification.paidAt ?? new Date(),
        verifiedAt: new Date(),
        actorId: webhookEvent ? 'webhook:paystack' : 'checkout:reverify',
      });
      return result ? 'credited' : 'already_credited';
    });
  }
}
