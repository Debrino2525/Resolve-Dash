import { CurrencyGHS, Pesewas } from '../domain/types/money';

export const BILLING_PROVIDER_TOKEN = Symbol('IBillingProvider');

export interface InitializePaymentInput {
  readonly reference: string;
  readonly email: string;
  readonly amountPesewas: Pesewas;
  readonly currency: CurrencyGHS;
  readonly callbackUrl?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface InitializePaymentOutput {
  readonly authorizationUrl: string;
  readonly accessCode: string;
  readonly reference: string;
}

export interface VerifyPaymentOutput {
  readonly reference: string;
  readonly status: 'success' | 'failed' | 'abandoned';
  readonly amountPesewas: Pesewas;
  readonly currency: string;
  readonly paystackTransactionId: string;
  readonly channel: string;
  readonly paidAt: Date | null;
  readonly gatewayResponse?: string;
}

export interface IBillingProvider {
  /**
   * Initializes a hosted checkout transaction with the payment provider.
   * Enforces exact pesewas and GHS currency.
   */
  initializeTransaction(input: InitializePaymentInput): Promise<InitializePaymentOutput>;

  /**
   * Authoritatively verifies the transaction with the payment gateway.
   */
  verifyTransaction(reference: string): Promise<VerifyPaymentOutput>;

  /**
   * Verifies the authenticity of an incoming webhook using HMAC SHA-512 in constant time.
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
}
