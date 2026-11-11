import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Rider } from '../domain/types/rider';
import { PhoneVerificationService } from '../verification/phone-verification.service';
import { RiderRepository } from './rider.repository';

export interface OnboardRiderDto {
  fullName: string;
  /** Unverified, typed-in number: only honoured when REQUIRE_VERIFIED_PHONE=false. */
  phoneNumber?: string;
  /** Proof from POST /riders/phone/verify that this account confirmed the number by SMS. */
  phoneVerificationToken?: string;
}

@Injectable()
export class RiderService {
  constructor(
    private readonly riderRepository: RiderRepository,
    private readonly phoneVerification: PhoneVerificationService,
  ) {}

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

    // A verified phone comes from our own SMS OTP proof (mNotify), or from the JWT phone claim,
    // which Supabase only sets after verifying the number itself (stored without '+').
    const verifiedPhone =
      this.phoneVerification.readProof(userId, dto.phoneVerificationToken) ??
      toE164(jwtPhoneNumber);

    let effectivePhone: string | undefined;
    if (requireVerifiedPhone()) {
      if (!verifiedPhone) {
        throw new BadRequestException(
          'Verify your phone number with the SMS code before completing onboarding',
        );
      }
      effectivePhone = verifiedPhone; // a typed-in dto.phoneNumber is ignored
    } else {
      effectivePhone = verifiedPhone || dto.phoneNumber;
      if (!effectivePhone) {
        throw new BadRequestException('Rider must have a verified phone number or provide one');
      }
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

  /** True if another rider already owns this number (checked before an SMS is sent). */
  readonly phoneTakenByAnother = async (phone: string, userId: string): Promise<boolean> => {
    const owner = await this.riderRepository.findRiderByPhone(phone);
    return Boolean(owner && owner.id !== userId);
  };

  async getProfile(userId: string): Promise<Rider> {
    const rider = await this.riderRepository.findRiderById(userId);
    if (!rider) {
      throw new NotFoundException('Rider profile not found. Please complete onboarding.');
    }
    return rider;
  }
}

/**
 * Whether onboarding must use an SMS-verified phone from the JWT (REQUIRE_VERIFIED_PHONE,
 * default true). Set to 'false' only while the Supabase phone/SMS provider is not configured.
 */
function requireVerifiedPhone(): boolean {
  return process.env.REQUIRE_VERIFIED_PHONE !== 'false';
}

/** Supabase phone claims are digits without '+' (e.g. "233241234567"); return E.164 or undefined. */
function toE164(phone: string | undefined): string | undefined {
  const trimmed = phone?.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}

/** True for a Postgres unique_violation (23505) whose constraint name mentions `column`. */
function isUniqueViolationOn(err: unknown, column: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr.code === '23505' && (pgErr.constraint ?? '').includes(column);
}
