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
import { RiderService } from './rider.service';

export interface OnboardRequestBody {
  fullName: string;
  phoneNumber?: string;
  phoneVerificationToken?: string;
}

export interface RiderProfileResponse {
  id: string;
  phoneNumber: string;
  fullName: string;
  onboardingStatus: string;
  createdAt: string;
}

const sendCodeSchema = z.object({ phoneNumber: z.string().trim().min(8).max(20) });
const verifyCodeSchema = z.object({
  verificationId: z.string().regex(/^[a-f0-9]{32}$/),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Code must be 6 digits'),
});

@Controller('riders')
@UseGuards(SupabaseAuthGuard)
export class RiderController {
  constructor(
    private readonly riderService: RiderService,
    private readonly phoneVerification: PhoneVerificationService,
  ) {}

  /** Sends a 6-digit SMS code (via mNotify) to confirm the rider owns this number. */
  @Post('phone/send-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: throttleTtlMs() } }) // each SMS costs money
  async sendPhoneCode(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ): Promise<SendCodeResult> {
    const parsed = sendCodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('A phone number is required');
    }
    return this.phoneVerification.sendCode(
      user.id,
      parsed.data.phoneNumber,
      undefined,
      this.riderService.phoneTakenByAnother,
    );
  }

  /** Checks the SMS code and returns a short-lived proof for POST /riders/onboard. */
  @Post('phone/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: throttleTtlMs() } })
  verifyPhoneCode(@CurrentUser() user: AuthUser, @Body() body: unknown): VerifyCodeResult {
    const parsed = verifyCodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid code');
    }
    return this.phoneVerification.verifyCode(user.id, parsed.data.verificationId, parsed.data.code);
  }

  @Post('onboard')
  async onboard(
    @CurrentUser() user: AuthUser,
    @Body() body: OnboardRequestBody,
  ): Promise<RiderProfileResponse> {
    const rider = await this.riderService.onboard(
      user.id,
      user.phoneNumber,
      user.email ?? null,
      body,
    );

    return {
      id: rider.id,
      phoneNumber: rider.phoneNumber,
      fullName: rider.fullName,
      onboardingStatus: rider.onboardingStatus,
      createdAt: rider.createdAt.toISOString(),
    };
  }

  @Get('me')
  async getMe(@CurrentUser() user: AuthUser): Promise<RiderProfileResponse> {
    const rider = await this.riderService.getProfile(user.id);

    return {
      id: rider.id,
      phoneNumber: rider.phoneNumber,
      fullName: rider.fullName,
      onboardingStatus: rider.onboardingStatus,
      createdAt: rider.createdAt.toISOString(),
    };
  }
}
