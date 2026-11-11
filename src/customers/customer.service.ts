import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PhoneVerificationService } from '../verification/phone-verification.service';
import { Customer, CustomerRepository } from './customer.repository';

@Injectable()
export class CustomerService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly phoneVerification: PhoneVerificationService,
  ) {}

  async getProfile(userId: string): Promise<Customer> {
    const customer = await this.customers.findById(userId);
    if (!customer) {
      throw new NotFoundException('Customer profile not found. Please complete sign-up.');
    }
    return customer;
  }

  /**
   * Edit name and contact email from the Account screen. The phone number stays as verified
   * (changing it needs a new SMS check); an email can be added or changed, not removed.
   */
  async updateDetails(userId: string, fullName: string, email: string | null): Promise<Customer> {
    const current = await this.getProfile(userId);
    const name = fullName.trim();
    if (name.length < 2 || name.length > 100) throw new BadRequestException('Enter your full name');
    return this.customers.upsert(userId, name, current.phoneNumber, email);
  }

  /** True if another customer already owns this number (checked before an SMS is sent). */
  readonly phoneTakenByAnother = async (phone: string, userId: string): Promise<boolean> => {
    const owner = await this.customers.findByPhone(phone);
    return Boolean(owner && owner.id !== userId);
  };

  /**
   * Creates (or updates) the customer profile. The phone must be SMS-verified: either a proof from
   * POST /customers/phone/verify, or a phone claim Supabase itself verified (stored without '+').
   */
  async onboard(
    userId: string,
    jwtPhone: string | undefined,
    email: string | null,
    fullName: string,
    phoneVerificationToken: string | undefined,
  ): Promise<Customer> {
    const name = (fullName ?? '').trim();
    if (name.length < 2 || name.length > 100) {
      throw new BadRequestException('Enter your full name');
    }
    const fromJwt = jwtPhone?.trim()
      ? jwtPhone.startsWith('+')
        ? jwtPhone
        : `+${jwtPhone}`
      : undefined;
    const phone = this.phoneVerification.readProof(userId, phoneVerificationToken) ?? fromJwt;
    if (!phone) {
      throw new BadRequestException('Verify your phone number with the SMS code first');
    }
    try {
      return await this.customers.upsert(userId, name, phone, email);
    } catch (err) {
      const pg = err as { code?: string; constraint?: string };
      if (pg.code === '23505' && (pg.constraint ?? '').includes('phone')) {
        throw new ConflictException(
          'This number already belongs to a GhanaDash account that signs in another way (Google, Apple or email). Sign out and use that option, or contact GhanaDash support.',
        );
      }
      throw err;
    }
  }
}
