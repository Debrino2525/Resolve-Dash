import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Rider } from '../domain/types/rider';
import { RiderRepository } from './rider.repository';
import { RiderService } from './rider.service';

describe('RiderService', () => {
  let service: RiderService;
  let mockRepository: jest.Mocked<RiderRepository>;

  const RIDER_ID = '22222222-2222-2222-2222-222222222222';
  const VALID_PHONE = '+233201234567';

  beforeEach(() => {
    mockRepository = {
      findRiderById: jest.fn(),
      findRiderByPhone: jest.fn(),
      createRiderProfile: jest.fn(),
    } as unknown as jest.Mocked<RiderRepository>;

    service = new RiderService(mockRepository);
  });

  describe('onboard', () => {
    it('throws BadRequestException if name is too short', async () => {
      await expect(service.onboard(RIDER_ID, VALID_PHONE, null, { fullName: 'A' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if phone number is missing or invalid', async () => {
      await expect(
        service.onboard(RIDER_ID, undefined, null, { fullName: 'Kofi Mensah' }),
      ).rejects.toThrow('Authenticated user must have a verified phone number');

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
