import { Module } from '@nestjs/common';
import { BILLING_PROVIDER_TOKEN } from './billing.interface';
import { PaystackProvider } from './paystack.provider';

@Module({
  providers: [
    {
      provide: BILLING_PROVIDER_TOKEN,
      useClass: PaystackProvider,
    },
  ],
  exports: [BILLING_PROVIDER_TOKEN],
})
export class BillingModule {}
