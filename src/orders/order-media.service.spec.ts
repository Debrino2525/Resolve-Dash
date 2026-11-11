import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SupabaseStorageClient } from '../storage/supabase-storage.client';
import { OrderMediaService, UploadedPhoto, validatePhoto } from './order-media.service';
import { isOwnPackagePhotoPath } from './order.service';
import { OrderRepository } from './order.repository';
import { DeliveryOrder } from './order.types';

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const RIDER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '99999999-9999-4999-8999-999999999999';
const ORDER = '33333333-3333-4333-8333-333333333333';
const MSG = '55555555-5555-4555-8555-555555555555';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const jpeg = (over: Partial<UploadedPhoto> = {}): UploadedPhoto => ({
  buffer: JPEG,
  mimetype: 'image/jpeg',
  size: JPEG.length,
  ...over,
});

function order(over: Partial<DeliveryOrder> = {}): DeliveryOrder {
  return {
    id: ORDER,
    customerId: CUSTOMER,
    riderId: RIDER,
    status: 'ASSIGNED',
    packagePhotoPath: `${CUSTOMER}/package/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`,
    ...over,
  } as DeliveryOrder;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(o: DeliveryOrder | null = order(), offerOpen = false) {
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('FROM order_offers'))
      return { rows: offerOpen ? [{}] : [], rowCount: offerOpen ? 1 : 0 };
    if (sql.startsWith('SELECT photo_path'))
      return { rows: [{ photo_path: 'x/chat/p.jpg' }], rowCount: 1 };
    if (sql.includes('FROM order_messages'))
      return {
        rows: [
          {
            id: MSG,
            sender_id: CUSTOMER,
            sender_role: 'CUSTOMER',
            body: 'Gate is blue',
            photo_path: null,
            created_at: new Date(),
          },
        ],
        rowCount: 1,
      };
    return { rows: [], rowCount: 1 };
  });
  const db = { query } as unknown as DatabaseService;
  const repo = {
    findById: jest.fn(async () => o),
    approvedRiderPhotoPath: jest.fn(async () => `${RIDER}/PROFILE_PHOTO/1.jpg`),
  } as unknown as OrderRepository;
  const storage = {
    upload: jest.fn(async () => undefined),
    download: jest.fn(async () => ({ body: Buffer.from('img'), contentType: 'image/jpeg' })),
  } as unknown as SupabaseStorageClient & { upload: jest.Mock; download: jest.Mock };
  return { svc: new OrderMediaService(db, repo, storage), query, storage };
}

describe('validatePhoto', () => {
  it('accepts a real JPEG', () => {
    expect(validatePhoto(jpeg())).toEqual({ ext: 'jpg', mimetype: 'image/jpeg' });
  });
  it('rejects a file whose bytes do not match its declared type', () => {
    expect(() => validatePhoto(jpeg({ buffer: Buffer.from('<html>evil</html>') }))).toThrow(
      BadRequestException,
    );
  });
  it('rejects missing and oversized files', () => {
    expect(() => validatePhoto(undefined)).toThrow(BadRequestException);
    expect(() => validatePhoto(jpeg({ size: 6 * 1024 * 1024 }))).toThrow(/5 MB/);
  });
});

describe('isOwnPackagePhotoPath', () => {
  it("accepts only the customer's own package folder", () => {
    const own = `${CUSTOMER}/package/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
    expect(isOwnPackagePhotoPath(CUSTOMER, own)).toBe(true);
    expect(isOwnPackagePhotoPath(STRANGER, own)).toBe(false);
    expect(isOwnPackagePhotoPath(CUSTOMER, `${CUSTOMER}/package/../../x.jpg`)).toBe(false);
    expect(
      isOwnPackagePhotoPath(CUSTOMER, `${CUSTOMER}/chat/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`),
    ).toBe(false);
  });
});

describe('OrderMediaService', () => {
  it('uploads a package photo into the uploader own folder', async () => {
    const { svc, storage } = setup();
    const { photoPath } = await svc.uploadPackagePhoto(CUSTOMER, 'tok', jpeg());
    expect(isOwnPackagePhotoPath(CUSTOMER, photoPath)).toBe(true);
    expect(storage.upload).toHaveBeenCalledWith(
      'order-photos',
      photoPath,
      JPEG,
      'image/jpeg',
      'tok',
    );
  });

  it('lets the customer, the rider and a rider with an open offer see the package photo', async () => {
    await expect(setup().svc.readPackagePhoto(CUSTOMER, 't', ORDER)).resolves.toBeDefined();
    await expect(setup().svc.readPackagePhoto(RIDER, 't', ORDER)).resolves.toBeDefined();
    const offered = setup(order({ riderId: null, status: 'SEARCHING' }), true);
    await expect(offered.svc.readPackagePhoto(STRANGER, 't', ORDER)).resolves.toBeDefined();
  });

  it('hides the package photo from anyone else', async () => {
    const { svc, storage } = setup(order(), false);
    await expect(svc.readPackagePhoto(STRANGER, 't', ORDER)).rejects.toThrow(NotFoundException);
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('shows the thread with the caller role and own messages marked', async () => {
    const thread = await setup().svc.thread(RIDER, ORDER);
    expect(thread).toMatchObject({ myRole: 'RIDER', open: true });
    expect(thread.messages[0]).toMatchObject({
      senderRole: 'CUSTOMER',
      mine: false,
      body: 'Gate is blue',
    });
  });

  it('keeps strangers out of the chat', async () => {
    await expect(setup().svc.thread(STRANGER, ORDER)).rejects.toThrow(NotFoundException);
  });

  it('has no chat before a rider is assigned', async () => {
    const { svc } = setup(order({ riderId: null, status: 'SEARCHING' }));
    await expect(svc.thread(CUSTOMER, ORDER)).rejects.toThrow(NotFoundException);
  });

  it('saves a trimmed text message with the sender role', async () => {
    const { svc, query } = setup();
    await svc.sendText(CUSTOMER, ORDER, '  Call me at the gate  ');
    const insert = query.mock.calls.find(([sql]) =>
      String(sql).startsWith('INSERT INTO order_messages'),
    );
    expect(insert?.[1]).toEqual([ORDER, CUSTOMER, 'CUSTOMER', 'Call me at the gate', null]);
  });

  it('rejects empty and over-long messages', async () => {
    const { svc } = setup();
    await expect(svc.sendText(CUSTOMER, ORDER, '   ')).rejects.toThrow(BadRequestException);
    await expect(svc.sendText(CUSTOMER, ORDER, 'x'.repeat(1001))).rejects.toThrow(/1000/);
  });

  it('makes the chat read-only after delivery', async () => {
    const { svc } = setup(order({ status: 'DELIVERED' }));
    await expect(svc.sendText(RIDER, ORDER, 'hi')).rejects.toThrow(ConflictException);
    await expect(svc.thread(RIDER, ORDER)).resolves.toMatchObject({ open: false });
  });

  it('stores chat photos under the sender folder for that order', async () => {
    const { svc, storage, query } = setup();
    await svc.sendPhoto(RIDER, 'tok', ORDER, jpeg(), 'This one?');
    const path = storage.upload.mock.calls[0][1] as string;
    expect(path.startsWith(`${RIDER}/chat/${ORDER}/`)).toBe(true);
    const insert = query.mock.calls.find(([sql]) =>
      String(sql).startsWith('INSERT INTO order_messages'),
    );
    expect(insert?.[1]).toEqual([ORDER, RIDER, 'RIDER', 'This one?', path]);
  });
});

describe('rider photo for the customer', () => {
  it('shows the approved photo to the customer while the delivery is in progress', async () => {
    const { svc, storage } = setup(order({ status: 'PICKED_UP' }));
    await svc.readRiderPhoto(CUSTOMER, 'cust-token', ORDER);
    expect(storage.download).toHaveBeenCalledWith(
      'rider-documents',
      `${RIDER}/PROFILE_PHOTO/1.jpg`,
      'cust-token',
    );
  });

  it.each([
    ['someone else', STRANGER, order()],
    ['the rider (not via this route)', RIDER, order()],
    ['after delivery', CUSTOMER, order({ status: 'DELIVERED' })],
  ])('refuses %s', async (_label, user, o) => {
    const { svc, storage } = setup(o);
    await expect(svc.readRiderPhoto(user, 't', ORDER)).rejects.toThrow(NotFoundException);
    expect(storage.download).not.toHaveBeenCalled();
  });
});
