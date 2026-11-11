import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { VerificationModule } from '../verification/verification.module';
import { CustomerController } from './customer.controller';
import { CustomerRepository } from './customer.repository';
import { CustomerService } from './customer.service';

@Module({
  imports: [DatabaseModule, VerificationModule],
  controllers: [CustomerController],
  providers: [CustomerRepository, CustomerService],
  exports: [CustomerService, CustomerRepository],
})
export class CustomersModule {}
