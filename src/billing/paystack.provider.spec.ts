import * as crypto from 'crypto';
import { GHS_CURRENCY, toPesewas } from '../domain/types/money';
import { PaystackProvider } from './paystack.provider';

const TEST_SECRET_KEY = 'sk_test_fake_paystack_secret_key_12345';
const BASE_URL = 'https://api.paystack.co';

/** Helper: create a PaystackProvider with the env key set and a mock fetch */
function makeProvider(mockFetch?: typeof fetch): PaystackProvider {
  process.env.PAYSTACK_SECRET_KEY = TEST_SECRET_KEY;
  const provider = new PaystackProvider();
  if (mockFetch) {
    // Inject mock fetch via property assignment (fetchImpl is private; cast for test)
    (provider as unknown as { fetchImpl: typeof fetch }).fetchImpl = mockFetch;
  }
  return provider;
}

describe('PaystackProvider', () => {
  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  describe('Configuration & Initialization', () => {
    it('throws if PAYSTACK_SECRET_KEY env var is not set', () => {
      delete process.env.PAYSTACK_SECRET_KEY;
      expect(() => new PaystackProvider()).toThrow('PAYSTACK_SECRET_KEY is not configured');
    });

    it('instantiates when PAYSTACK_SECRET_KEY is set', () => {
      process.env.PAYSTACK_SECRET_KEY = TEST_SECRET_KEY;
      const provider = new PaystackProvider();
      expect(provider).toBeDefined();
    });
  });

  describe('initializeTransaction', () => {
    it('rejects currencies other than GHS', async () => {
      const provider = makeProvider();
      await expect(
        provider.initializeTransaction({
          reference: 'ref-1',
          email: 'rider@example.com',
          amountPesewas: toPesewas(5000),
          // @ts-expect-error Testing invalid runtime currency
          currency: 'USD',
        }),
      ).rejects.toThrow('Unsupported currency: USD. Only GHS is supported.');
    });

    it('sends correct request payload and parses success response', async () => {
      let capturedUrl = '';
      let capturedInit: RequestInit | undefined;

      const mockFetch: typeof fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedInit = init;
        return new Response(
          JSON.stringify({
            status: true,
            message: 'Authorization URL created',
            data: {
              authorization_url: 'https://checkout.paystack.com/access123',
              access_code: 'access123',
              reference: 'ref-weekly-sub-001',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const provider = makeProvider(mockFetch);
      const result = await provider.initializeTransaction({
        reference: 'ref-weekly-sub-001',
        email: 'rider@test.com',
        amountPesewas: toPesewas(5000),
        currency: GHS_CURRENCY,
        callbackUrl: 'https://api.example.com/subscriptions/callback',
      });

      expect(capturedUrl).toBe(`${BASE_URL}/transaction/initialize`);
      expect(capturedInit?.method).toBe('POST');
      expect((capturedInit?.headers as Record<string, string>)?.['Authorization']).toBe(
        `Bearer ${TEST_SECRET_KEY}`,
      );

      const parsedBody = JSON.parse(capturedInit?.body as string);
      expect(parsedBody).toEqual({
        email: 'rider@test.com',
        amount: 5000,
        currency: 'GHS',
        reference: 'ref-weekly-sub-001',
        callback_url: 'https://api.example.com/subscriptions/callback',
        metadata: undefined,
      });

      expect(result).toEqual({
        authorizationUrl: 'https://checkout.paystack.com/access123',
        accessCode: 'access123',
        reference: 'ref-weekly-sub-001',
      });
    });

    it('throws descriptive error on duplicate reference', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({ status: false, message: 'Duplicate Transaction Reference' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );

      const provider = makeProvider(mockFetch);
      await expect(
        provider.initializeTransaction({
          reference: 'dup-ref',
          email: 'rider@test.com',
          amountPesewas: toPesewas(5000),
          currency: GHS_CURRENCY,
        }),
      ).rejects.toThrow('Paystack initialization rejected: Duplicate Transaction Reference');
    });
  });

  describe('verifyTransaction', () => {
    it('throws if reference is empty', async () => {
      const provider = makeProvider();
      await expect(provider.verifyTransaction('')).rejects.toThrow(
        'Transaction reference must not be empty',
      );
    });

    it('verifies a successful transaction and returns structured result', async () => {
      let capturedUrl = '';
      const mockFetch: typeof fetch = async (input) => {
        capturedUrl = String(input);
        return new Response(
          JSON.stringify({
            status: true,
            message: 'Verification successful',
            data: {
              id: 987654321,
              status: 'success',
              reference: 'ref-weekly-sub-001',
              amount: 5000,
              currency: 'GHS',
              channel: 'mobile_money',
              paid_at: '2026-11-09T10:15:30.000Z',
              gateway_response: 'Successful',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const provider = makeProvider(mockFetch);
      const result = await provider.verifyTransaction('ref-weekly-sub-001');

      expect(capturedUrl).toBe(`${BASE_URL}/transaction/verify/ref-weekly-sub-001`);
      expect(result.status).toBe('success');
      expect(result.amountPesewas).toBe(5000);
      expect(result.paystackTransactionId).toBe('987654321');
      expect(result.channel).toBe('mobile_money');
      expect(result.paidAt?.toISOString()).toBe('2026-11-09T10:15:30.000Z');
    });

    it('handles abandoned status safely', async () => {
      const mockFetch: typeof fetch = async () =>
        new Response(
          JSON.stringify({
            status: true,
            message: 'Verification successful',
            data: {
              id: 111222,
              status: 'abandoned',
              reference: 'abandoned-ref',
              amount: 5000,
              currency: 'GHS',
              channel: 'card',
              paid_at: null,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

      const provider = makeProvider(mockFetch);
      const result = await provider.verifyTransaction('abandoned-ref');
      expect(result.status).toBe('abandoned');
      expect(result.paidAt).toBeNull();
    });
  });

  describe('verifyWebhookSignature', () => {
    it('returns true for authentic HMAC SHA-512 signature', () => {
      const provider = makeProvider();
      const rawBody = Buffer.from(
        JSON.stringify({
          event: 'charge.success',
          data: { id: 123, reference: 'test-ref', amount: 5000 },
        }),
        'utf8',
      );
      const validSignature = crypto
        .createHmac('sha512', TEST_SECRET_KEY)
        .update(rawBody)
        .digest('hex');

      expect(provider.verifyWebhookSignature(rawBody, validSignature)).toBe(true);
    });

    it('returns false for forged signature', () => {
      const provider = makeProvider();
      const rawBody = Buffer.from('{"tampered":true}', 'utf8');
      const wrongSignature = crypto
        .createHmac('sha512', 'different_secret_key')
        .update(rawBody)
        .digest('hex');

      expect(provider.verifyWebhookSignature(rawBody, wrongSignature)).toBe(false);
    });

    it('returns false for signatures of mismatched length', () => {
      const provider = makeProvider();
      const rawBody = Buffer.from('{"tampered":true}', 'utf8');
      expect(provider.verifyWebhookSignature(rawBody, 'short')).toBe(false);
      expect(provider.verifyWebhookSignature(rawBody, '')).toBe(false);
    });
  });
});
