import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { GHS_CURRENCY, toPesewas } from '../domain/types/money';
import {
  IBillingProvider,
  InitializePaymentInput,
  InitializePaymentOutput,
  VerifyPaymentOutput,
} from './billing.interface';

export interface PaystackProviderOptions {
  readonly secretKey?: string;
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
}

interface PaystackInitApiResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyApiResponse {
  status: boolean;
  message: string;
  data?: {
    id: number | string;
    status: string;
    reference: string;
    amount: number;
    currency: string;
    channel: string;
    paid_at: string | null;
    gateway_response?: string;
  };
}

@Injectable()
export class PaystackProvider implements IBillingProvider {
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor() {
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key || key.trim().length === 0) {
      throw new Error('PAYSTACK_SECRET_KEY is not configured');
    }
    this.secretKey = key.trim();
    this.baseUrl = 'https://api.paystack.co';
    this.fetchImpl = globalThis.fetch.bind(globalThis);
  }

  /**
   * Initializes a hosted transaction on Paystack.
   * Throws an error on duplicate reference, network failure, or API rejection.
   */
  async initializeTransaction(input: InitializePaymentInput): Promise<InitializePaymentOutput> {
    if (input.currency !== GHS_CURRENCY) {
      throw new Error(
        `Unsupported currency: ${input.currency}. Only ${GHS_CURRENCY} is supported.`,
      );
    }

    const endpoint = `${this.baseUrl}/transaction/initialize`;
    const payload = {
      email: input.email,
      amount: input.amountPesewas,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    };

    let response: Response;
    try {
      response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Network error initializing Paystack transaction for ref: ${input.reference}: ${msg}`,
      );
      throw new Error(`Paystack initialization failed: network error`);
    }

    let parsed: PaystackInitApiResponse;
    try {
      parsed = (await response.json()) as PaystackInitApiResponse;
    } catch {
      throw new Error(`Paystack returned invalid JSON with HTTP status ${response.status}`);
    }

    if (!response.ok || !parsed.status || !parsed.data) {
      const errMsg = parsed.message || `HTTP ${response.status}`;
      this.logger.warn(`Paystack rejected initialization for ref: ${input.reference} - ${errMsg}`);
      throw new Error(`Paystack initialization rejected: ${errMsg}`);
    }

    return {
      authorizationUrl: parsed.data.authorization_url,
      accessCode: parsed.data.access_code,
      reference: parsed.data.reference,
    };
  }

  /**
   * Authoritatively queries Paystack for transaction verification status.
   */
  async verifyTransaction(reference: string): Promise<VerifyPaymentOutput> {
    if (!reference || reference.trim().length === 0) {
      throw new Error('Transaction reference must not be empty');
    }

    const endpoint = `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference.trim())}`;
    let response: Response;

    try {
      response = await this.fetchImpl(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Network error verifying Paystack transaction for ref: ${reference}: ${msg}`,
      );
      throw new Error(`Paystack verification failed: network error`);
    }

    let parsed: PaystackVerifyApiResponse;
    try {
      parsed = (await response.json()) as PaystackVerifyApiResponse;
    } catch {
      throw new Error(
        `Paystack verification returned invalid JSON with HTTP status ${response.status}`,
      );
    }

    if (!response.ok || !parsed.status || !parsed.data) {
      const errMsg = parsed.message || `HTTP ${response.status}`;
      this.logger.warn(`Paystack verification query failed for ref: ${reference} - ${errMsg}`);
      throw new Error(`Paystack verification failed: ${errMsg}`);
    }

    const data = parsed.data;
    const rawStatus = (data.status || '').toLowerCase();
    const status: 'success' | 'failed' | 'abandoned' =
      rawStatus === 'success' ? 'success' : rawStatus === 'abandoned' ? 'abandoned' : 'failed';

    return {
      reference: data.reference,
      status,
      amountPesewas: toPesewas(data.amount),
      currency: data.currency,
      paystackTransactionId: String(data.id),
      channel: data.channel || 'unknown',
      paidAt: data.paid_at ? new Date(data.paid_at) : null,
      gatewayResponse: data.gateway_response,
    };
  }

  /**
   * Verifies the authenticity of an incoming Paystack webhook payload using constant-time
   * HMAC SHA-512 comparison.
   *
   * @param rawBody The exact, unmodified byte buffer of the HTTP request body.
   * @param signature The x-paystack-signature header value sent with the webhook.
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
    if (!signature || signature.trim().length === 0 || !rawBody) {
      return false;
    }

    const computedHex = crypto.createHmac('sha512', this.secretKey).update(rawBody).digest('hex');

    const expectedBuffer = Buffer.from(computedHex, 'utf8');
    const actualBuffer = Buffer.from(signature.trim(), 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  }
}
