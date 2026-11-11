import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { CustomerRepository } from '../customers/customer.repository';
import { DatabaseService } from '../database/database.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { DispatchService } from './dispatch.service';
import { OrderRepository } from './order.repository';
import { OrderService, QUOTE_TTL_MS } from './order.service';
import { DeliveryOrder, OrderStop } from './order.types';
import { MAX_PIN_ATTEMPTS, RiderDispatchService } from './rider-dispatch.service';

const USER = '11111111-1111-4111-8111-111111111111';
const RIDER = '22222222-2222-4222-8222-222222222222';
const ORDER = '33333333-3333-4333-8333-333333333333';
const OFFER = '44444444-4444-4444-8444-444444444444';

const stop = (lat: number, lng: number): OrderStop => ({
  lat,
  lng,
  address: 'Somewhere, Accra',
  landmark: null,
  gpsCode: null,
  contactName: 'Kofi Mensah',
  contactPhone: '+233245518920',
});
const PICKUP = stop(5.556, -0.182);
const DROPOFF = stop(5.635, -0.155);

function order(over: Partial<DeliveryOrder> = {}): DeliveryOrder {
  return {
    id: ORDER,
    code: 'GD-ABC234',
    customerId: USER,
    riderId: RIDER,
    status: 'PICKED_UP',
    pickup: PICKUP,
    dropoff: DROPOFF,
    packageType: 'SMALL_PARCEL',
    fragile: false,
    notes: null,
    distanceMeters: 5200,
    durationSeconds: 600,
    baseFarePesewas: 1800,
    distanceFarePesewas: 650,
    farePesewas: 2450,
    paymentMethod: 'CASH',
    deliveryPin: '8309',
    pinAttempts: 0,
    packagePhotoPath: null,
    rating: null,
    ratingTags: null,
    ratingComment: null,
    cancelReason: null,
    cancelledBy: null,
    requestedAt: new Date().toISOString(),
    assignedAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    cancelledAt: null,
    ...over,
  };
}

describe('OrderService quotes', () => {
  let service: OrderService;
  let orders: jest.Mocked<OrderRepository>;
  let dispatch: jest.Mocked<DispatchService>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.MAPBOX_ACCESS_TOKEN = 'pk.test';
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ distance: 5200, duration: 564 }] }),
    }) as unknown as typeof fetch;
    orders = {
      insert: jest
        .fn()
        .mockImplementation(async (o) => order({ ...o, status: 'SEARCHING', riderId: null })),
      countActiveForCustomer: jest.fn().mockResolvedValue(0),
      assignedRider: jest.fn(),
    } as unknown as jest.Mocked<OrderRepository>;
    dispatch = { kick: jest.fn() } as unknown as jest.Mocked<DispatchService>;
    const customers = {
      findById: jest.fn().mockResolvedValue({ id: USER }),
    } as unknown as CustomerRepository;
    service = new OrderService({} as DatabaseService, orders, customers, dispatch);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('prices by Mapbox road distance and signs the quote', async () => {
    const q = await service.quote(USER, PICKUP, DROPOFF);
    expect(q).toMatchObject({
      distanceMeters: 5200,
      durationSeconds: 564,
      farePesewas: 2450,
      estimated: false,
    });
    expect(q.quoteToken).toContain('.');
  });

  it('falls back to an estimate when Mapbox is unreachable', async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const q = await service.quote(USER, PICKUP, DROPOFF);
    expect(q.estimated).toBe(true);
    expect(q.farePesewas).toBeGreaterThan(1800);
  });

  it('refuses trips outside Ghana', async () => {
    await expect(service.quote(USER, PICKUP, stop(6.45, 3.4))).rejects.toThrow('Ghana');
  });

  it('creates an order at the quoted price and starts dispatch', async () => {
    const q = await service.quote(USER, PICKUP, DROPOFF);
    orders.assignedRider.mockResolvedValue(null);
    const created = await service.create(USER, {
      pickup: PICKUP,
      dropoff: DROPOFF,
      packageType: 'FOOD',
      fragile: true,
      notes: null,
      quoteToken: q.quoteToken,
    });
    expect(orders.insert).toHaveBeenCalledWith(
      expect.objectContaining({ farePesewas: 2450, distanceMeters: 5200, fragile: true }),
    );
    expect(orders.insert.mock.calls[0][0].deliveryPin).toMatch(/^\d{4}$/);
    expect(created.status).toBe('SEARCHING');
    expect(dispatch.kick).toHaveBeenCalled();
  });

  it('rejects a quote used for a different drop-off', async () => {
    const q = await service.quote(USER, PICKUP, DROPOFF);
    await expect(
      service.create(USER, {
        pickup: PICKUP,
        dropoff: stop(5.7, -0.1),
        packageType: 'FOOD',
        fragile: false,
        notes: null,
        quoteToken: q.quoteToken,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(orders.insert).not.toHaveBeenCalled();
  });

  it("rejects someone else's quote, tampered quotes and expired quotes", async () => {
    const q = await service.quote(USER, PICKUP, DROPOFF);
    const input = {
      pickup: PICKUP,
      dropoff: DROPOFF,
      packageType: 'FOOD' as const,
      fragile: false,
      notes: null,
    };
    await expect(
      service.create('99999999-9999-4999-8999-999999999999', {
        ...input,
        quoteToken: q.quoteToken,
      }),
    ).rejects.toThrow(BadRequestException);
    const [body, sig] = q.quoteToken.split('.');
    const cheaper = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), f: 100 }),
    ).toString('base64url');
    await expect(
      service.create(USER, { ...input, quoteToken: `${cheaper}.${sig}` }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create(
        USER,
        { ...input, quoteToken: q.quoteToken },
        Date.now() + QUOTE_TTL_MS + 1000,
      ),
    ).rejects.toThrow('expired');
  });

  it('limits active deliveries per customer', async () => {
    orders.countActiveForCustomer.mockResolvedValue(3);
    const q = await service.quote(USER, PICKUP, DROPOFF);
    await expect(
      service.create(USER, {
        pickup: PICKUP,
        dropoff: DROPOFF,
        packageType: 'FOOD',
        fragile: false,
        notes: null,
        quoteToken: q.quoteToken,
      }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('RiderDispatchService', () => {
  let service: RiderDispatchService;
  let client: { query: jest.Mock };
  let orders: jest.Mocked<OrderRepository>;
  let subs: jest.Mocked<SubscriptionService>;
  let db: jest.Mocked<DatabaseService>;

  beforeEach(() => {
    client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    db = {
      withTransaction: jest.fn(async (cb: (c: PoolClient) => Promise<unknown>) =>
        cb(client as unknown as PoolClient),
      ),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    } as unknown as jest.Mocked<DatabaseService>;
    orders = {
      lockById: jest.fn(),
      activeJobForRider: jest.fn().mockResolvedValue(null),
      customerName: jest.fn().mockResolvedValue('Ama'),
    } as unknown as jest.Mocked<OrderRepository>;
    subs = {
      getSubscriptionStatus: jest.fn().mockResolvedValue({ eligibility: { canAccept: true } }),
    } as unknown as jest.Mocked<SubscriptionService>;
    service = new RiderDispatchService(db, orders, subs, {
      kick: jest.fn(),
    } as unknown as DispatchService);
  });

  describe('delivered (PIN handover)', () => {
    it('completes the delivery with the right PIN', async () => {
      orders.lockById.mockResolvedValue(order());
      await service.delivered(RIDER, ORDER, '8309');
      expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status = 'DELIVERED'"), [
        ORDER,
      ]);
    });

    it('counts wrong PINs and says how many attempts are left', async () => {
      orders.lockById.mockResolvedValue(order({ pinAttempts: 2 }));
      await expect(service.delivered(RIDER, ORDER, '1111')).rejects.toThrow('2 attempts left');
      expect(client.query).toHaveBeenCalledWith(expect.stringContaining('pin_attempts + 1'), [
        ORDER,
      ]);
    });

    it('locks after too many wrong PINs', async () => {
      orders.lockById.mockResolvedValue(order({ pinAttempts: MAX_PIN_ATTEMPTS }));
      await expect(service.delivered(RIDER, ORDER, '8309')).rejects.toThrow(HttpException);
    });

    it("refuses another rider's job and jobs not yet picked up", async () => {
      orders.lockById.mockResolvedValue(order({ riderId: '55555555-5555-4555-8555-555555555555' }));
      await expect(service.delivered(RIDER, ORDER, '8309')).rejects.toThrow('not found');
      orders.lockById.mockResolvedValue(order({ status: 'ASSIGNED' }));
      await expect(service.delivered(RIDER, ORDER, '8309')).rejects.toThrow('pickup');
    });
  });

  describe('accept', () => {
    it('assigns the order when the offer is open and the order still searching', async () => {
      client.query.mockImplementation(async (sql: string) =>
        sql.includes('FROM order_offers')
          ? { rows: [{ order_id: ORDER, status: 'OFFERED', expired: false }] }
          : { rows: [] },
      );
      orders.lockById.mockResolvedValue(order({ status: 'SEARCHING', riderId: null }));
      await service.accept(RIDER, OFFER);
      expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status = 'ASSIGNED'"), [
        ORDER,
        RIDER,
      ]);
    });

    it('refuses expired offers', async () => {
      client.query.mockResolvedValue({
        rows: [{ order_id: ORDER, status: 'OFFERED', expired: true }],
      });
      await expect(service.accept(RIDER, OFFER)).rejects.toThrow('no longer available');
    });

    it('refuses when the customer cancelled meanwhile', async () => {
      client.query.mockImplementation(async (sql: string) =>
        sql.includes('FROM order_offers')
          ? { rows: [{ order_id: ORDER, status: 'OFFERED', expired: false }] }
          : { rows: [] },
      );
      orders.lockById.mockResolvedValue(order({ status: 'CANCELLED' }));
      await expect(service.accept(RIDER, OFFER)).rejects.toThrow(ConflictException);
    });

    it('refuses riders whose plan or approval lapsed', async () => {
      subs.getSubscriptionStatus.mockResolvedValue({ eligibility: { canAccept: false } } as never);
      await expect(service.accept(RIDER, OFFER)).rejects.toThrow(ForbiddenException);
    });
  });

  it('requires a location and an active plan to go online', async () => {
    await expect(service.updatePresence(RIDER, { online: true })).rejects.toThrow('location');
    subs.getSubscriptionStatus.mockResolvedValue({
      eligibility: { canAccept: false, reason: 'SUBSCRIPTION_EXPIRED' },
    } as never);
    await expect(
      service.updatePresence(RIDER, { online: true, lat: 5.5, lng: -0.2 }),
    ).rejects.toThrow('plan');
  });
});
