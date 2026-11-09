import { Pesewas, CurrencyGHS } from './money';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'FLAGGED_FOR_REVIEW';

export interface SubscriptionPayment {
  id: string; // UUID v4
  riderId: string;
  reference: string;
  checkoutExpiresAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  amountPesewas: Pesewas;
  currency: CurrencyGHS;
  status: PaymentStatus;
  paystackTransactionId: string | null;
  channel: string | null;
  verifiedAt: Date | null;
  paidAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InitializeCheckoutParams {
  riderId: string;
  email: string;
  checkoutExpiresAt: Date;
  amountPesewas: Pesewas;
  currency: CurrencyGHS;
  callbackUrl?: string;
}

export interface CheckoutSession {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
  checkoutExpiresAt: Date;
}

export interface PaymentVerificationResult {
  reference: string;
  status: 'success' | 'failed' | 'abandoned';
  amountPesewas: Pesewas;
  currency: string;
  paystackTransactionId: string;
  channel: string;
  paidAt: Date;
}
