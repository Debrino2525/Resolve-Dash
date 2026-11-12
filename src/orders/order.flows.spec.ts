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
    extraStops: [],
    packageType: 'SMALL_PARCEL',
    fragile: false,
    notes: null,
    distanceMeters: 5200,
    durationSeconds: 600,
    baseFarePesewas: 1800,
    distanceFarePesewas: 650,
    stopsFarePesewas: 0,
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

  it('prices a multi-stop route along every drop-off, in order', async () => {
    const via = stop(5.6, -0.17);
    const q = await service.quote(USER, PICKUP, DROPOFF, [via]);
    const url = (globalThis.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('-0.182000,5.556000;-0.170000,5.600000;-0.155000,5.635000');
    // 5.2 km road + one extra drop-off: 18.00 + 6.50 + 5.00
    expect(q).toMatchObject({ stopsFarePesewas: 500, farePesewas: 2950, dropoffCount: 2 });
  });

  it('refuses more than 4 drop-offs and repeated drop-offs', async () => {
    const a = stop(5.6, -0.17);
    await expect(
      service.quote(USER, PICKUP, DROPOFF, [
        a,
        stop(5.61, -0.17),
        stop(5.62, -0.17),
        stop(5.63, -0.17),
      ]),
    ).rejects.toThrow('Up to 4');
    await expect(service.quote(USER, PICKUP, DROPOFF, [a, a])).rejects.toThrow('same place');
  });

  it('books the drop-offs with their own PINs, and rejects a changed stop list', async () => {
    const via = stop(5.6, -0.17);
    const q = await service.quote(USER, PICKUP, DROPOFF, [via]);
    const base = {
      pickup: PICKUP,
      dropoff: DROPOFF,
      packageType: 'FOOD' as const,
      fragile: false,
      notes: null,
      quoteToken: q.quoteToken,
    };
    await expect(service.create(USER, base)).rejects.toThrow('does not match');
    const created = await service.create(USER, { ...base, stops: [via] });
    const inserted = orders.insert.mock.calls[0][0];
    expect(inserted.stopsFarePesewas).toBe(500);
    expect(inserted.farePesewas).toBe(2950);
    expect(inserted.extraStops).toHaveLength(1);
    expect(inserted.extraStops[0]).toMatchObject({ status: 'PENDING', pinAttempts: 0 });
    expect(inserted.extraStops[0].pin).toMatch(/^\d{4}$/);
    // The customer sees each stop's PIN to give the receiver.
    expect(created.stops[0]).toMatchObject({ index: 0, pin: inserted.extraStops[0].pin });
    expect(created.stops[0]).not.toHaveProperty('pinAttempts');
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

describe('OrderService recent places', () => {
  it("returns the customer's own stops, newest first, merging spots within 40 m", async () => {
    const home = { ...stop(4.8975, -1.7553), address: 'Market Circle', landmark: 'Blue gate' };
    const homeAgain = { ...stop(4.89755, -1.75532), address: 'Market Circle (old)' }; // ~6 m away
    const office = { ...stop(4.9201, -1.7802), address: 'Anaji', gpsCode: 'WS-123-4567' };
    const listForCustomer = jest
      .fn()
      .mockResolvedValue([
        order({ dropoff: home, pickup: office, requestedAt: '2026-11-10T10:00:00.000Z' }),
        order({ dropoff: homeAgain, pickup: office, requestedAt: '2026-11-01T10:00:00.000Z' }),
      ]);
    const service = new OrderService(
      {} as DatabaseService,
      { listForCustomer } as unknown as OrderRepository,
      {} as CustomerRepository,
      {} as DispatchService,
    );
    await expect(service.recentPlaces(USER)).resolves.toEqual([
      {
        lat: 4.8975,
        lng: -1.7553,
        address: 'Market Circle',
        landmark: 'Blue gate',
        gpsCode: null,
        lastUsedAt: '2026-11-10T10:00:00.000Z',
      },
      {
        lat: 4.9201,
        lng: -1.7802,
        address: 'Anaji',
        landmark: null,
        gpsCode: 'WS-123-4567',
        lastUsedAt: '2026-11-10T10:00:00.000Z',
      },
    ]);
    expect(listForCustomer).toHaveBeenCalledWith(USER, 30);
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

  describe('multi-stop drop-offs', () => {
    const pending = {
      ...stop(5.6, -0.17),
      pin: '4521',
      pinAttempts: 0,
      status: 'PENDING' as const,
      doneAt: null,
      failReason: null,
    };
    const savedStops = (): { status: string; pinAttempts: number; failReason: string | null }[] => {
      const call = client.query.mock.calls.find((c) => String(c[0]).includes('extra_stops'));
      return JSON.parse(call?.[1][1] as string);
    };

    it('will not finish the final drop-off while others are pending', async () => {
      orders.lockById.mockResolvedValue(order({ extraStops: [pending] }));
      await expect(service.delivered(RIDER, ORDER, '8309')).rejects.toThrow('1 left');
    });

    it("completes a drop-off with that stop's PIN", async () => {
      orders.lockById.mockResolvedValue(order({ extraStops: [pending] }));
      await service.stopDelivered(RIDER, ORDER, 0, '4521');
      expect(savedStops()[0].status).toBe('DELIVERED');
    });

    it('counts wrong PINs per drop-off', async () => {
      orders.lockById.mockResolvedValue(order({ extraStops: [pending] }));
      await expect(service.stopDelivered(RIDER, ORDER, 0, '8309')).rejects.toThrow(
        '4 attempts left',
      );
      expect(savedStops()[0]).toMatchObject({ status: 'PENDING', pinAttempts: 1 });
    });

    it('records a drop-off that could not be delivered, then allows the final one', async () => {
      orders.lockById.mockResolvedValue(order({ extraStops: [pending] }));
      await service.stopFailed(RIDER, ORDER, 0, 'Nobody at the gate');
      expect(savedStops()[0]).toMatchObject({ status: 'FAILED', failReason: 'Nobody at the gate' });
      orders.lockById.mockResolvedValue(order({ extraStops: [{ ...pending, status: 'FAILED' }] }));
      await service.delivered(RIDER, ORDER, '8309');
      expect(client.query).toHaveBeenCalledWith(expect.stringContaining("status = 'DELIVERED'"), [
        ORDER,
      ]);
    });

    it('refuses unknown or finished drop-offs and jobs not picked up', async () => {
      orders.lockById.mockResolvedValue(order({ extraStops: [pending] }));
      await expect(service.stopDelivered(RIDER, ORDER, 3, '4521')).rejects.toThrow('not found');
      orders.lockById.mockResolvedValue(
        order({ extraStops: [{ ...pending, status: 'DELIVERED' }] }),
      );
      await expect(service.stopDelivered(RIDER, ORDER, 0, '4521')).rejects.toThrow('already done');
      orders.lockById.mockResolvedValue(order({ status: 'ASSIGNED', extraStops: [pending] }));
      await expect(service.stopFailed(RIDER, ORDER, 0, 'Closed')).rejects.toThrow('pickup');
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
