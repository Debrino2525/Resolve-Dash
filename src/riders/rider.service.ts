import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Rider } from '../domain/types/rider';
import { RiderRepository } from './rider.repository';

export interface OnboardRiderDto {
  fullName: string;
}

@Injectable()
export class RiderService {
  constructor(private readonly riderRepository: RiderRepository) {}

  async onboard(
    userId: string,
    phoneNumber: string | undefined,
    email: string | null,
    dto: OnboardRiderDto,
  ): Promise<Rider> {
    const trimmedName = (dto.fullName || '').trim();
    if (!trimmedName || trimmedName.length < 2) {
      throw new BadRequestException('Full name must be at least 2 characters long');
    }

    if (!phoneNumber) {
      throw new BadRequestException('Authenticated user must have a verified phone number');
    }

    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (!e164Regex.test(phoneNumber)) {
      throw new BadRequestException(
        `Phone number ${phoneNumber} does not match valid E.164 format`,
      );
    }

    return this.riderRepository.createRiderProfile(userId, phoneNumber, email, trimmedName);
  }

  async getProfile(userId: string): Promise<Rider> {
    const rider = await this.riderRepository.findRiderById(userId);
    if (!rider) {
      throw new NotFoundException('Rider profile not found. Please complete onboarding.');
    }
    return rider;
  }
}
