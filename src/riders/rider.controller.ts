import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RiderService } from './rider.service';

export interface OnboardRequestBody {
  fullName: string;
  phoneNumber?: string;
}

export interface RiderProfileResponse {
  id: string;
  phoneNumber: string;
  fullName: string;
  onboardingStatus: string;
  createdAt: string;
}

@Controller('riders')
@UseGuards(SupabaseAuthGuard)
export class RiderController {
  constructor(private readonly riderService: RiderService) {}

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
