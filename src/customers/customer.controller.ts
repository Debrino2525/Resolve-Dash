import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { throttleTtlMs } from '../common/throttle.config';
import {
  PhoneVerificationService,
  SendCodeResult,
  VerifyCodeResult,
} from '../verification/phone-verification.service';
import { Customer } from './customer.repository';
import { CustomerService } from './customer.service';

export interface CustomerProfileResponse {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string | null;
  createdAt: string;
}

const toResponse = (c: Customer): CustomerProfileResponse => ({
  id: c.id,
  fullName: c.fullName,
  phoneNumber: c.phoneNumber,
  email: c.email,
  createdAt: c.createdAt.toISOString(),
});

const sendSchema = z.object({ phoneNumber: z.string().trim().min(8).max(20) });
const verifySchema = z.object({
  verificationId: z.string().regex(/^[a-f0-9]{32}$/),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
});
const onboardSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phoneVerificationToken: z.string().max(1000).optional(),
  /** Contact email from the sign-up form (phone sign-ups have no email on the account). */
  email: z.string().trim().toLowerCase().email().max(254).optional(),
});

@Controller('customers')
@UseGuards(SupabaseAuthGuard)
export class CustomerController {
  constructor(
    private readonly customers: CustomerService,
    private readonly phoneVerification: PhoneVerificationService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<CustomerProfileResponse> {
    return toResponse(await this.customers.getProfile(user.id));
  }

  @Post('phone/send-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: throttleTtlMs() } }) // each SMS costs money
  sendCode(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<SendCodeResult> {
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('A phone number is required');
    return this.phoneVerification.sendCode(
      user.id,
      parsed.data.phoneNumber,
      undefined,
      this.customers.phoneTakenByAnother,
    );
  }

  @Post('phone/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: throttleTtlMs() } })
  verify(@CurrentUser() user: AuthUser, @Body() body: unknown): VerifyCodeResult {
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid code');
    }
    return this.phoneVerification.verifyCode(user.id, parsed.data.verificationId, parsed.data.code);
  }

  @Post('onboard')
  async onboard(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ): Promise<CustomerProfileResponse> {
    const parsed = onboardSchema.safeParse(body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      throw new BadRequestException(
        field === 'email' ? 'Check your email address' : 'Enter your full name',
      );
    }
    const customer = await this.customers.onboard(
      user.id,
      user.phoneNumber,
      user.email ?? parsed.data.email ?? null,
      parsed.data.fullName,
      parsed.data.phoneVerificationToken,
    );
    return toResponse(customer);
  }
}
