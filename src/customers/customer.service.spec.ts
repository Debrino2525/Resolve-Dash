import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PhoneVerificationService } from '../verification/phone-verification.service';
import { Customer, CustomerRepository } from './customer.repository';
import { CustomerService } from './customer.service';

const USER = '11111111-1111-4111-8111-111111111111';
const existing: Customer = {
  id: USER,
  fullName: 'Kwesi Mensah',
  phoneNumber: '+233241234567',
  email: null,
  createdAt: new Date('2026-11-01T10:00:00Z'),
};

describe('CustomerService.updateDetails', () => {
  let repo: { findById: jest.Mock; upsert: jest.Mock };
  let svc: CustomerService;

  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue(existing),
      upsert: jest.fn().mockImplementation(async (id, fullName, phoneNumber, email) => ({
        ...existing,
        id,
        fullName,
        phoneNumber,
        email,
      })),
    };
    svc = new CustomerService(
      repo as unknown as CustomerRepository,
      {} as PhoneVerificationService,
    );
  });

  it('changes name and email but keeps the verified phone', async () => {
    const c = await svc.updateDetails(USER, '  Kwesi A. Mensah ', 'kwesi@example.com');
    expect(repo.upsert).toHaveBeenCalledWith(
      USER,
      'Kwesi A. Mensah',
      '+233241234567',
      'kwesi@example.com',
    );
    expect(c.fullName).toBe('Kwesi A. Mensah');
  });

  it('rejects a too-short name', async () => {
    await expect(svc.updateDetails(USER, 'K', null)).rejects.toThrow(BadRequestException);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('needs an existing profile', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(svc.updateDetails(USER, 'Kwesi Mensah', null)).rejects.toThrow(
      NotFoundException,
    );
  });
});
