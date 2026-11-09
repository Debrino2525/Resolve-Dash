import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Rider } from '../domain/types/rider';
import { RiderRepository } from './rider.repository';

export interface OnboardRiderDto {
  fullName: string;
  phoneNumber?: string;
}

@Injectable()
export class RiderService {
  constructor(private readonly riderRepository: RiderRepository) {}

  async onboard(
    userId: string,
    jwtPhoneNumber: string | undefined,
    email: string | null,
    dto: OnboardRiderDto,
  ): Promise<Rider> {
    const trimmedName = (dto.fullName || '').trim();
    if (!trimmedName || trimmedName.length < 2) {
      throw new BadRequestException('Full name must be at least 2 characters long');
    }

    const effectivePhone = jwtPhoneNumber || dto.phoneNumber;
    if (!effectivePhone) {
      throw new BadRequestException('Rider must have a verified phone number or provide one');
    }

    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(effectivePhone)) {
      throw new BadRequestException(
        `Phone number ${effectivePhone} does not match valid E.164 format`,
      );
    }

    return this.riderRepository.createRiderProfile(userId, effectivePhone, email, trimmedName);
  }

  async getProfile(userId: string): Promise<Rider> {
    const rider = await this.riderRepository.findRiderById(userId);
    if (!rider) {
      throw new NotFoundException('Rider profile not found. Please complete onboarding.');
    }
    return rider;
  }
}
