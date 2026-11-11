import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Rider } from '../domain/types/rider';
import { PhoneVerificationService } from '../verification/phone-verification.service';
import { RiderRepository } from './rider.repository';
import { RiderService } from './rider.service';

describe('RiderService', () => {
  let service: RiderService;
  let mockRepository: jest.Mocked<RiderRepository>;
  let mockPhoneVerification: jest.Mocked<PhoneVerificationService>;

  const RIDER_ID = '22222222-2222-2222-2222-222222222222';
  const VALID_PHONE = '+233201234567';

  beforeEach(() => {
    mockRepository = {
      findRiderById: jest.fn(),
      findRiderByPhone: jest.fn(),
      createRiderProfile: jest.fn(),
    } as unknown as jest.Mocked<RiderRepository>;

    mockPhoneVerification = {
      readProof: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<PhoneVerificationService>;

    delete process.env.REQUIRE_VERIFIED_PHONE; // default: verified phone required
    service = new RiderService(mockRepository, mockPhoneVerification);
  });

  describe('onboard', () => {
    it('returns 409 Conflict when the phone number belongs to another rider', async () => {
      mockRepository.createRiderProfile.mockRejectedValue(
        Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'riders_phone_number_key',
        }),
      );

      await expect(
        service.onboard(RIDER_ID, VALID_PHONE, null, { fullName: 'Kofi Mensah' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows unrelated database errors unchanged', async () => {
      const dbDown = new Error('connection refused');
      mockRepository.createRiderProfile.mockRejectedValue(dbDown);

      await expect(
        service.onboard(RIDER_ID, VALID_PHONE, null, { fullName: 'Kofi Mensah' }),
      ).rejects.toBe(dbDown);
    });

    it('throws BadRequestException if name is too short', async () => {
      await expect(service.onboard(RIDER_ID, VALID_PHONE, null, { fullName: 'A' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('requires an SMS-verified phone by default and ignores a typed-in number', async () => {
      await expect(
        service.onboard(RIDER_ID, undefined, null, {
          fullName: 'Kofi Mensah',
          phoneNumber: VALID_PHONE,
        }),
      ).rejects.toThrow('Verify your phone number with the SMS code');
      expect(mockRepository.createRiderProfile).not.toHaveBeenCalled();
    });

    it('uses the phone from a valid SMS verification proof', async () => {
      mockPhoneVerification.readProof.mockReturnValue('+233241112222');
      mockRepository.createRiderProfile.mockResolvedValue({} as Rider);

      await service.onboard(RIDER_ID, undefined, null, {
        fullName: 'Kofi Mensah',
        phoneNumber: '+233209999999', // ignored: not verified
        phoneVerificationToken: 'proof',
      });

      expect(mockPhoneVerification.readProof).toHaveBeenCalledWith(RIDER_ID, 'proof');
      expect(mockRepository.createRiderProfile).toHaveBeenCalledWith(
        RIDER_ID,
        '+233241112222',
        null,
        'Kofi Mensah',
      );
    });

    it('accepts a Supabase-verified JWT phone stored without the leading +', async () => {
      mockRepository.createRiderProfile.mockResolvedValue({} as Rider);
      await service.onboard(RIDER_ID, '233241234567', null, { fullName: 'Kofi Mensah' });
      expect(mockRepository.createRiderProfile).toHaveBeenCalledWith(
        RIDER_ID,
        '+233241234567',
        null,
        'Kofi Mensah',
      );
    });

    it('with REQUIRE_VERIFIED_PHONE=false, falls back to a typed-in number', async () => {
      process.env.REQUIRE_VERIFIED_PHONE = 'false';
      mockRepository.createRiderProfile.mockResolvedValue({} as Rider);

      await service.onboard(RIDER_ID, undefined, null, {
        fullName: 'Kofi Mensah',
        phoneNumber: VALID_PHONE,
      });
      expect(mockRepository.createRiderProfile).toHaveBeenCalledWith(
        RIDER_ID,
        VALID_PHONE,
        null,
        'Kofi Mensah',
      );

      await expect(
        service.onboard(RIDER_ID, undefined, null, { fullName: 'Kofi Mensah' }),
      ).rejects.toThrow('Rider must have a verified phone number or provide one');
      delete process.env.REQUIRE_VERIFIED_PHONE;
    });

    it('throws BadRequestException if the phone number is invalid', async () => {
      await expect(
        service.onboard(RIDER_ID, '0201234567', null, { fullName: 'Kofi Mensah' }),
      ).rejects.toThrow('does not match valid E.164 format');
    });

    it('creates rider profile in PENDING_VERIFICATION on valid input', async () => {
      const mockCreated: Rider = {
        id: RIDER_ID,
        phoneNumber: VALID_PHONE,
        email: 'kofi@example.com',
        fullName: 'Kofi Mensah',
        onboardingStatus: 'PENDING_VERIFICATION',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.createRiderProfile.mockResolvedValue(mockCreated);

      const result = await service.onboard(RIDER_ID, VALID_PHONE, 'kofi@example.com', {
        fullName: 'Kofi Mensah',
      });

      expect(result.onboardingStatus).toBe('PENDING_VERIFICATION');
      expect(mockRepository.createRiderProfile).toHaveBeenCalledWith(
        RIDER_ID,
        VALID_PHONE,
        'kofi@example.com',
        'Kofi Mensah',
      );
    });
  });

  describe('getProfile', () => {
    it('throws NotFoundException if rider does not exist', async () => {
      mockRepository.findRiderById.mockResolvedValue(null);

      await expect(service.getProfile(RIDER_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns rider profile when found', async () => {
      const mockRider: Rider = {
        id: RIDER_ID,
        phoneNumber: VALID_PHONE,
        email: null,
        fullName: 'Kwame Nkrumah',
        onboardingStatus: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findRiderById.mockResolvedValue(mockRider);

      const result = await service.getProfile(RIDER_ID);
      expect(result.fullName).toBe('Kwame Nkrumah');
      expect(result.onboardingStatus).toBe('ACTIVE');
    });
  });
});
