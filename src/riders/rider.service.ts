import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

    try {
      return await this.riderRepository.createRiderProfile(
        userId,
        effectivePhone,
        email,
        trimmedName,
      );
    } catch (err) {
      // riders.phone_number is UNIQUE: another account already registered this number.
      if (isUniqueViolationOn(err, 'phone')) {
        throw new ConflictException(
          'This phone number is already registered to another rider account. Contact GhanaDash operations if it is yours.',
        );
      }
      throw err;
    }
  }

  async getProfile(userId: string): Promise<Rider> {
    const rider = await this.riderRepository.findRiderById(userId);
    if (!rider) {
      throw new NotFoundException('Rider profile not found. Please complete onboarding.');
    }
    return rider;
  }
}

/** True for a Postgres unique_violation (23505) whose constraint name mentions `column`. */
function isUniqueViolationOn(err: unknown, column: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr.code === '23505' && (pgErr.constraint ?? '').includes(column);
}
