import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { IBillingProvider } from '../billing/billing.interface';
import { DatabaseService } from '../database/database.service';
import { GHS_CURRENCY, toPesewas } from '../domain/types/money';
import { SubscriptionPayment } from '../domain/types/payment';
import { Subscription } from '../domain/types/subscription';
import { SubscriptionRepository } from './subscription.repository';
import { SubscriptionService, WEEKLY_SUBSCRIPTION_PESEWAS } from './subscription.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let mockDb: jest.Mocked<DatabaseService>;
  let mockRepository: jest.Mocked<SubscriptionRepository>;
  let mockBillingProvider: jest.Mocked<IBillingProvider>;
  const mockClient = { tag: 'tx-client' } as unknown as PoolClient;

  const RIDER_ID = '11111111-1111-1111-1111-111111111111';
  const EMAIL = 'rider@example.com';

  beforeEach(() => {
    mockDb = {
      withTransaction: jest.fn().mockImplementation(async (cb) => cb(mockClient)),
    } as unknown as jest.Mocked<DatabaseService>;

    mockRepository = {
      findSubscriptionByRiderId: jest.fn(),
      findRiderOnboardingStatus: jest.fn().mockResolvedValue('ACTIVE'),
      findPendingPaymentByRiderId: jest.fn(),
      findPaymentByReference: jest.fn(),
      createPendingPayment: jest.fn(),
      markPaymentFailed: jest.fn(),
      webhookEventExists: jest.fn().mockResolvedValue(false),
      recordWebhookEventIfNotExists: jest.fn().mockResolvedValue(true),
      recordWebhookEventInTransaction: jest.fn().mockResolvedValue(true),
      creditSubscriptionInTransaction: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<SubscriptionRepository>;

    mockBillingProvider = {
      initializeTransaction: jest.fn(),
      verifyTransaction: jest.fn(),
      verifyWebhookSignature: jest.fn(),
    };

    service = new SubscriptionService(mockDb, mockRepository, mockBillingProvider);
  });

  describe('initializeCheckout', () => {
    it('returns existing checkout if unexpired pending payment exists', async () => {
      const futureDate = new Date(Date.now() + 15 * 60 * 1000);
      const pendingPayment: SubscriptionPayment = {
        id: 'pay-1',
        riderId: RIDER_ID,
        reference: 'ref-existing-pending',
        paystackAccessCode: 'access-code-123',
        checkoutExpiresAt: futureDate,
        periodStart: null,
        periodEnd: null,
        amountPesewas: WEEKLY_SUBSCRIPTION_PESEWAS,
        currency: GHS_CURRENCY,
        status: 'PENDING',
        paystackTransactionId: null,
        channel: null,
        verifiedAt: null,
        paidAt: null,
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findPendingPaymentByRiderId.mockResolvedValue(pendingPayment);

      const session = await service.initializeCheckout(RIDER_ID, EMAIL);

      expect(session.reference).toBe('ref-existing-pending');
      expect(session.authorizationUrl).toBe('https://checkout.paystack.com/access-code-123');
      expect(mockBillingProvider.initializeTransaction).not.toHaveBeenCalled();
    });

    it('verifies stale pending payment with Paystack first; credits if already paid', async () => {
      const pastDate = new Date(Date.now() - 5 * 60 * 1000); // 5 mins ago
      const stalePayment: SubscriptionPayment = {
        id: 'pay-2',
        riderId: RIDER_ID,
        reference: 'ref-stale-pending',
        paystackAccessCode: 'stale-access',
        checkoutExpiresAt: pastDate,
        periodStart: null,
        periodEnd: null,
        amountPesewas: WEEKLY_SUBSCRIPTION_PESEWAS,
        currency: GHS_CURRENCY,
        status: 'PENDING',
        paystackTransactionId: null,
        channel: null,
        verifiedAt: null,
        paidAt: null,
        failureReason: null,
        createdAt: pastDate,
        updatedAt: pastDate,
      };

      mockRepository.findPendingPaymentByRiderId.mockResolvedValue(stalePayment);
      mockBillingProvider.verifyTransaction.mockResolvedValue({
        reference: 'ref-stale-pending',
        status: 'success',
        amountPesewas: WEEKLY_SUBSCRIPTION_PESEWAS,
        currency: 'GHS',
        paystackTransactionId: 'tx-last-second-success',
        channel: 'mobile_money',
        paidAt: new Date(),
      });

      await expect(service.initializeCheckout(RIDER_ID, EMAIL)).rejects.toThrow(ConflictException);
      expect(mockBillingProvider.verifyTransaction).toHaveBeenCalledWith('ref-stale-pending');
      expect(mockDb.withTransaction).toHaveBeenCalled();
    });

    it('creates fresh checkout session when no pending payment exists', async () => {
      mockRepository.findPendingPaymentByRiderId.mockResolvedValue(null);
      mockBillingProvider.initializeTransaction.mockResolvedValue({
        authorizationUrl: 'https://checkout.paystack.com/new-access',
        accessCode: 'new-access',
        reference: 'sub_new_ref_123',
      });

      const session = await service.initializeCheckout(RIDER_ID, EMAIL);

      expect(session.authorizationUrl).toBe('https://checkout.paystack.com/new-access');
      expect(session.accessCode).toBe('new-access');
      expect(mockRepository.createPendingPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          riderId: RIDER_ID,
          amountPesewas: WEEKLY_SUBSCRIPTION_PESEWAS,
          currency: GHS_CURRENCY,
        }),
      );
    });
  });

  describe('handleWebhook', () => {
    it('throws UnauthorizedException if webhook signature is invalid', async () => {
      mockBillingProvider.verifyWebhookSignature.mockReturnValue(false);

      await expect(service.handleWebhook(Buffer.from('{}'), 'invalid_signature')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns duplicate: true if dedupe key already exists in DB', async () => {
      mockBillingProvider.verifyWebhookSignature.mockReturnValue(true);
      mockRepository.webhookEventExists.mockResolvedValue(true); // Duplicate

      const payload = Buffer.from(
        JSON.stringify({
          event: 'charge.success',
          data: { id: 1234, reference: 'ref-1', amount: 5000 },
        }),
      );

      const result = await service.handleWebhook(payload, 'valid-sig');

      expect(result).toEqual({ received: true, duplicate: true });
      expect(mockBillingProvider.verifyTransaction).not.toHaveBeenCalled();
    });

    it('processes authentic charge.success, verifies with gateway, and credits in transaction', async () => {
      mockBillingProvider.verifyWebhookSignature.mockReturnValue(true);

      mockBillingProvider.verifyTransaction.mockResolvedValue({
        reference: 'ref-paid-1',
        status: 'success',
        amountPesewas: toPesewas(5000),
        currency: 'GHS',
        paystackTransactionId: 'pst-100',
        channel: 'mobile_money',
        paidAt: new Date('2026-11-09T10:00:00Z'),
      });

      mockRepository.findPaymentByReference.mockResolvedValue({
        id: 'pay-1',
        riderId: RIDER_ID,
        reference: 'ref-paid-1',
        paystackAccessCode: 'paid-access',
        checkoutExpiresAt: new Date(),
        periodStart: null,
        periodEnd: null,
        amountPesewas: toPesewas(5000),
        currency: GHS_CURRENCY,
        status: 'PENDING',
        paystackTransactionId: null,
        channel: null,
        verifiedAt: null,
        paidAt: null,
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const payload = Buffer.from(
        JSON.stringify({
          event: 'charge.success',
          data: { id: 100, reference: 'ref-paid-1', amount: 5000 },
        }),
      );

      const result = await service.handleWebhook(payload, 'valid-sig');

      expect(result).toEqual({ received: true, credited: true });
      expect(mockDb.withTransaction).toHaveBeenCalled();
      expect(mockRepository.creditSubscriptionInTransaction).toHaveBeenCalled();
    });
  });

  function pendingPayment(overrides: Partial<SubscriptionPayment> = {}): SubscriptionPayment {
    return {
      id: 'pay-x',
      riderId: RIDER_ID,
      reference: 'ref-x',
      paystackAccessCode: 'access-x',
      checkoutExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      periodStart: null,
      periodEnd: null,
      amountPesewas: WEEKLY_SUBSCRIPTION_PESEWAS,
      currency: GHS_CURRENCY,
      status: 'PENDING',
      paystackTransactionId: null,
      channel: null,
      verifiedAt: null,
      paidAt: null,
      failureReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function chargeSuccessBody(reference: string, id = 500): Buffer {
    return Buffer.from(
      JSON.stringify({ event: 'charge.success', data: { id, reference, amount: 5000 } }),
    );
  }

  function gatewaySuccess(reference: string, currency = 'GHS'): void {
    mockBillingProvider.verifyTransaction.mockResolvedValue({
      reference,
      status: 'success',
      amountPesewas: WEEKLY_SUBSCRIPTION_PESEWAS,
      currency,
      paystackTransactionId: 'pst-' + reference,
      channel: 'mobile_money',
      paidAt: new Date(),
    });
  }

  describe('checkout reuse (regression: broken checkout URL)', () => {
    it('rebuilds the hosted URL from the stored access code, not the reference', async () => {
      mockRepository.findPendingPaymentByRiderId.mockResolvedValue(
        pendingPayment({ reference: 'sub_123_abcd', paystackAccessCode: 'ac_real' }),
      );

      const session = await service.initializeCheckout(RIDER_ID, EMAIL);

      expect(session.authorizationUrl).toBe('https://checkout.paystack.com/ac_real');
      expect(session.accessCode).toBe('ac_real');
      expect(session.authorizationUrl).not.toContain('sub_123_abcd');
    });

    it('starts a fresh checkout when the pending row has no access code', async () => {
      mockRepository.findPendingPaymentByRiderId.mockResolvedValue(
        pendingPayment({ reference: 'legacy-ref', paystackAccessCode: null }),
      );
      mockBillingProvider.verifyTransaction.mockResolvedValue({
        reference: 'legacy-ref',
        status: 'abandoned',
        amountPesewas: WEEKLY_SUBSCRIPTION_PESEWAS,
        currency: 'GHS',
        paystackTransactionId: '1',
        channel: 'unknown',
        paidAt: null,
      });
      mockBillingProvider.initializeTransaction.mockResolvedValue({
        authorizationUrl: 'https://checkout.paystack.com/fresh',
        accessCode: 'fresh',
        reference: 'sub_fresh',
      });

      const session = await service.initializeCheckout(RIDER_ID, EMAIL);

      expect(mockRepository.markPaymentFailed).toHaveBeenCalledWith('legacy-ref', 'EXPIRED_UNPAID');
      expect(session.authorizationUrl).toBe('https://checkout.paystack.com/fresh');
    });
  });

  describe('webhook dedupe atomicity (regression: lost payments)', () => {
    beforeEach(() => {
      mockBillingProvider.verifyWebhookSignature.mockReturnValue(true);
    });

    it('records the dedupe key inside the credit transaction, not before it', async () => {
      gatewaySuccess('ref-a');
      mockRepository.findPaymentByReference.mockResolvedValue(
        pendingPayment({ reference: 'ref-a' }),
      );

      const result = await service.handleWebhook(chargeSuccessBody('ref-a'), 'sig');

      expect(result).toEqual({ received: true, credited: true });
      expect(mockRepository.recordWebhookEventIfNotExists).not.toHaveBeenCalled();
      expect(mockRepository.recordWebhookEventInTransaction).toHaveBeenCalledWith(
        mockClient,
        'charge.success:ref-a:500',
        'charge.success',
        expect.any(Object),
      );
      expect(mockRepository.creditSubscriptionInTransaction).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ reference: 'ref-a', actorId: 'webhook:paystack' }),
      );
    });

    it('does not mark the event processed when gateway verification throws', async () => {
      mockBillingProvider.verifyTransaction.mockRejectedValue(new Error('network error'));

      await expect(service.handleWebhook(chargeSuccessBody('ref-b'), 'sig')).rejects.toThrow(
        'network error',
      );
      expect(mockRepository.recordWebhookEventIfNotExists).not.toHaveBeenCalled();
      expect(mockRepository.recordWebhookEventInTransaction).not.toHaveBeenCalled();
    });

    it('propagates credit failures so the transaction (and dedupe key) rolls back', async () => {
      gatewaySuccess('ref-c');
      mockRepository.findPaymentByReference.mockResolvedValue(
        pendingPayment({ reference: 'ref-c' }),
      );
      mockRepository.creditSubscriptionInTransaction.mockRejectedValue(new Error('db down'));

      await expect(service.handleWebhook(chargeSuccessBody('ref-c'), 'sig')).rejects.toThrow(
        'db down',
      );
      expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
      expect(mockRepository.recordWebhookEventIfNotExists).not.toHaveBeenCalled();
    });

    it('reports duplicate when a concurrent delivery already recorded the key', async () => {
      gatewaySuccess('ref-d');
      mockRepository.findPaymentByReference.mockResolvedValue(
        pendingPayment({ reference: 'ref-d' }),
      );
      mockRepository.recordWebhookEventInTransaction.mockResolvedValue(false);

      const result = await service.handleWebhook(chargeSuccessBody('ref-d'), 'sig');

      expect(result).toEqual({ received: true, duplicate: true });
      expect(mockRepository.creditSubscriptionInTransaction).not.toHaveBeenCalled();
    });

    it('does not credit a payment settled in a non-GHS currency', async () => {
      gatewaySuccess('ref-e', 'USD');

      const result = await service.handleWebhook(chargeSuccessBody('ref-e'), 'sig');

      expect(result).toEqual({ received: true, credited: false });
      expect(mockRepository.creditSubscriptionInTransaction).not.toHaveBeenCalled();
    });
  });

  describe('getSubscriptionStatus', () => {
    it('returns canAccept: true when rider is in active period', async () => {
      const activeSub: Subscription = {
        id: 'sub-1',
        riderId: RIDER_ID,
        status: 'ACTIVE',
        trialEndsAt: null,
        paidUntil: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days left
        graceEndsAt: null,
        trialUsed: true,
        remindersSent: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findSubscriptionByRiderId.mockResolvedValue(activeSub);

      const result = await service.getSubscriptionStatus(RIDER_ID);
      expect(result.eligibility.canAccept).toBe(true);
      expect(result.eligibility.effectiveStatus).toBe('ACTIVE');
    });

    it('returns canAccept: false when subscription is expired', async () => {
      const expiredSub: Subscription = {
        id: 'sub-1',
        riderId: RIDER_ID,
        status: 'SUSPENDED',
        trialEndsAt: null,
        paidUntil: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // expired 2 days ago
        graceEndsAt: null,
        trialUsed: true,
        remindersSent: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findSubscriptionByRiderId.mockResolvedValue(expiredSub);

      const result = await service.getSubscriptionStatus(RIDER_ID);
      expect(result.eligibility.canAccept).toBe(false);
      expect(result.eligibility.reason).toBe('SUBSCRIPTION_EXPIRED');
    });
    it('refuses dispatch for a rider who is not admin-approved, even with paid access', async () => {
      mockRepository.findSubscriptionByRiderId.mockResolvedValue({
        id: 'sub-2',
        riderId: RIDER_ID,
        status: 'ACTIVE',
        trialEndsAt: null,
        paidUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        graceEndsAt: null,
        trialUsed: true,
        remindersSent: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      for (const status of ['REJECTED', 'PENDING_VERIFICATION', null] as const) {
        mockRepository.findRiderOnboardingStatus.mockResolvedValue(status);
        const result = await service.getSubscriptionStatus(RIDER_ID);
        expect(result.eligibility.canAccept).toBe(false);
        expect(result.eligibility.reason).toBe('RIDER_NOT_APPROVED');
        expect(result.eligibility.effectiveStatus).toBe('ACTIVE');
      }
    });

    it('reports the derived status, not the stale stored one', async () => {
      mockRepository.findSubscriptionByRiderId.mockResolvedValue({
        id: 'sub-3',
        riderId: RIDER_ID,
        status: 'ACTIVE', // stored value never advanced
        trialEndsAt: null,
        paidUntil: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        graceEndsAt: null,
        trialUsed: true,
        remindersSent: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getSubscriptionStatus(RIDER_ID);
      expect(result.eligibility.effectiveStatus).toBe('SUSPENDED');
      expect(result.eligibility.canAccept).toBe(false);
      expect(result.eligibility.reason).toBe('SUBSCRIPTION_EXPIRED');
    });
  });
});
