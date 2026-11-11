import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RiderDocument } from '../domain/types/document';
import { SupabaseStorageClient } from '../storage/supabase-storage.client';
import { RiderDocumentsRepository } from './rider-documents.repository';
import {
  buildChecklist,
  MAX_DOCUMENT_BYTES,
  RiderDocumentsService,
  UploadedDocumentFile,
} from './rider-documents.service';
import { RiderRepository } from './rider.repository';

describe('RiderDocumentsService', () => {
  const RIDER = '11111111-1111-1111-1111-111111111111';
  const TOKEN = 'rider-jwt';
  const TODAY = new Date('2026-11-10T12:00:00Z');

  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
  const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(100)]);
  const jpeg = (size = JPEG.length): UploadedDocumentFile => ({
    buffer: JPEG,
    mimetype: 'image/jpeg',
    size,
  });

  let docs: jest.Mocked<RiderDocumentsRepository>;
  let riders: jest.Mocked<RiderRepository>;
  let storage: jest.Mocked<SupabaseStorageClient>;
  let service: RiderDocumentsService;

  beforeEach(() => {
    docs = {
      listForRider: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
      review: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<RiderDocumentsRepository>;
    riders = {
      findRiderById: jest
        .fn()
        .mockResolvedValue({ id: RIDER, onboardingStatus: 'PENDING_VERIFICATION' }),
    } as unknown as jest.Mocked<RiderRepository>;
    storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      download: jest.fn(),
    } as unknown as jest.Mocked<SupabaseStorageClient>;
    service = new RiderDocumentsService(docs, riders, storage);
  });

  const submit = (
    type: string,
    input: { documentNumber?: string; expiryDate?: string },
    file: UploadedDocumentFile | undefined = jpeg(),
  ): ReturnType<RiderDocumentsService['submit']> =>
    service.submit(RIDER, TOKEN, type, input, file, TODAY);

  describe('profile photo', () => {
    it('needs no number or expiry, and is stored under the rider’s folder', async () => {
      await submit('PROFILE_PHOTO', {});
      expect(storage.upload.mock.calls[0][1]).toMatch(
        new RegExp(`^${RIDER}/PROFILE_PHOTO/\\d+\\.jpg$`),
      );
      expect(docs.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          docType: 'PROFILE_PHOTO',
          documentNumber: 'SELFIE',
          expiryDate: null,
        }),
      );
    });

    it('must be a photo, not a PDF', async () => {
      await expect(
        submit('PROFILE_PHOTO', {}, { buffer: PDF, mimetype: 'application/pdf', size: PDF.length }),
      ).rejects.toThrow('must be a photo');
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('lets the rider read their own photo for their avatar', async () => {
      docs.listForRider.mockResolvedValue([
        { docType: 'PROFILE_PHOTO', storagePath: `${RIDER}/PROFILE_PHOTO/1.jpg` } as RiderDocument,
      ]);
      storage.download.mockResolvedValue({ body: JPEG, contentType: 'image/jpeg' });
      await service.readOwnProfilePhoto(RIDER, TOKEN);
      expect(storage.download).toHaveBeenCalledWith(
        'rider-documents',
        `${RIDER}/PROFILE_PHOTO/1.jpg`,
        TOKEN,
      );
    });
  });

  describe('submit', () => {
    it('stores the file in the rider’s own folder with their JWT, then upserts metadata', async () => {
      await submit('GHANA_CARD', { documentNumber: 'gha-123456789-0', expiryDate: '2030-01-31' });

      expect(storage.upload).toHaveBeenCalledWith(
        'rider-documents',
        expect.stringMatching(new RegExp(`^${RIDER}/GHANA_CARD/\\d+\\.jpg$`)),
        JPEG,
        'image/jpeg',
        TOKEN,
      );
      expect(docs.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          riderId: RIDER,
          docType: 'GHANA_CARD',
          documentNumber: 'GHA-123456789-0', // upper-cased
          expiryDate: '2030-01-31',
          contentType: 'image/jpeg',
        }),
      );
    });

    it('accepts a PDF', async () => {
      await submit(
        'INSURANCE',
        { documentNumber: 'POL-778', expiryDate: '2027-06-01' },
        { buffer: PDF, mimetype: 'application/pdf', size: PDF.length },
      );
      expect(storage.upload.mock.calls[0][1]).toMatch(/\.pdf$/);
    });

    it('404s an unknown document type', async () => {
      await expect(submit('PASSPORT', { documentNumber: 'X1234' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('requires a rider profile', async () => {
      riders.findRiderById.mockResolvedValue(null);
      await expect(
        submit('INSURANCE', { documentNumber: 'POL-1', expiryDate: '2027-01-01' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses uploads from rejected riders', async () => {
      riders.findRiderById.mockResolvedValue({ id: RIDER, onboardingStatus: 'REJECTED' } as never);
      await expect(
        submit('INSURANCE', { documentNumber: 'POL-1', expiryDate: '2027-01-01' }),
      ).rejects.toThrow(ForbiddenException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a too-short number',
        'INSURANCE',
        { documentNumber: 'P1', expiryDate: '2027-01-01' },
        'Enter the',
      ],
      [
        'a malformed Ghana Card number',
        'GHANA_CARD',
        { documentNumber: 'GHA-12345', expiryDate: '2030-01-01' },
        'looks wrong',
      ],
      ['a missing expiry', 'DRIVERS_LICENSE', { documentNumber: 'DL-55555' }, 'expiry date'],
      [
        'an impossible date',
        'ROADWORTHY',
        { documentNumber: 'M-24-GR 1', expiryDate: '2027-02-30' },
        'DD/MM/YYYY',
      ],
      [
        'an expired document',
        'ROADWORTHY',
        { documentNumber: 'M-24-GR 1', expiryDate: '2026-11-09' },
        'expired',
      ],
    ])('rejects %s without uploading', async (_l, type, input, message) => {
      await expect(submit(type, input)).rejects.toThrow(message);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('accepts a document expiring today', async () => {
      await expect(
        submit('ROADWORTHY', { documentNumber: 'M-24-GR 1', expiryDate: '2026-11-10' }),
      ).resolves.toBeDefined();
    });

    it.each([
      ['no file', null, 'Attach a photo'],
      ['an oversized file', jpeg(MAX_DOCUMENT_BYTES + 1), 'larger than 5 MB'],
      ['an unsupported type', { buffer: JPEG, mimetype: 'image/gif', size: 104 }, 'JPG, PNG'],
      [
        'a file whose bytes do not match its type',
        { buffer: PDF, mimetype: 'image/jpeg', size: PDF.length },
        'JPG, PNG',
      ],
    ])('rejects %s', async (_l, file, message) => {
      await expect(
        submit('INSURANCE', { documentNumber: 'POL-123', expiryDate: '2027-01-01' }, file as never),
      ).rejects.toThrow(message);
      expect(storage.upload).not.toHaveBeenCalled();
    });
  });

  describe('review', () => {
    beforeEach(() => {
      docs.findById.mockResolvedValue({
        id: 'doc-1',
        storagePath: `${RIDER}/X/1.jpg`,
      } as RiderDocument);
    });

    it('requires a note when sending a document back', async () => {
      await expect(service.review(RIDER, 'doc-1', 'REJECTED', '  ', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(docs.review).not.toHaveBeenCalled();
    });

    it('records the reviewer', async () => {
      await service.review(RIDER, 'doc-1', 'REJECTED', 'Photo is blurry', 'admin-1');
      expect(docs.review).toHaveBeenCalledWith(
        RIDER,
        'doc-1',
        'REJECTED',
        'Photo is blurry',
        'admin-1',
      );
    });

    it('404s a document that is not this rider’s', async () => {
      docs.findById.mockResolvedValue(null);
      await expect(
        service.review(RIDER, 'other', 'APPROVED', undefined, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('reads files for admins with the admin’s own token', async () => {
      storage.download.mockResolvedValue({ body: JPEG, contentType: 'image/jpeg' });
      await service.readFileForAdmin(RIDER, 'doc-1', 'admin-jwt');
      expect(storage.download).toHaveBeenCalledWith(
        'rider-documents',
        `${RIDER}/X/1.jpg`,
        'admin-jwt',
      );
    });
  });

  describe('buildChecklist', () => {
    it('lists all required documents (four papers and the profile photo) in order, marking missing ones', () => {
      const c = buildChecklist([
        {
          id: 'd1',
          riderId: RIDER,
          docType: 'INSURANCE',
          documentNumber: 'POL',
          expiryDate: '2027-01-01',
          storagePath: 'p',
          contentType: 'image/jpeg',
          status: 'APPROVED',
          reviewNote: null,
          reviewedAt: null,
          submittedAt: TODAY,
        },
      ]);
      expect(c.items.map((i) => [i.docType, i.status])).toEqual([
        ['GHANA_CARD', 'MISSING'],
        ['DRIVERS_LICENSE', 'MISSING'],
        ['ROADWORTHY', 'MISSING'],
        ['INSURANCE', 'APPROVED'],
        ['PROFILE_PHOTO', 'MISSING'],
      ]);
      expect(c).toMatchObject({ submittedCount: 1, approvedCount: 1, requiredCount: 5 });
    });
  });
});
