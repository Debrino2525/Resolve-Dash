import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  ADMIN_PAGE_SIZE,
  AdminOperationsService,
  parseDeliveryFilter,
  parsePage,
  phoneDigits,
} from './admin-operations.service';

describe('AdminOperationsService', () => {
  const ORDER = '22222222-2222-2222-2222-222222222222';
  const CUSTOMER = '33333333-3333-3333-3333-333333333333';
  const RIDER = '11111111-1111-1111-1111-111111111111';

  function orderRow(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: ORDER,
      code: 'GD-ABC123',
      status: 'DELIVERED',
      customer_id: CUSTOMER,
      customer_name: 'Esi Owusu',
      customer_phone: '+233201112222',
      rider_id: RIDER,
      rider_name: 'Kofi Mensah',
      rider_phone: '+233241234567',
      fare_pesewas: 2350,
      package_type: 'SMALL_PARCEL',
      fragile: false,
      distance_m: 4200,
      pickup_lat: '4.8960',
      pickup_lng: '-1.7550',
      pickup_address: 'Market Circle',
      pickup_landmark: null,
      dropoff_lat: 4.93,
      dropoff_lng: -1.77,
      dropoff_address: 'Anaji',
      dropoff_landmark: 'Near the school',
      requested_at: new Date('2026-11-10T10:00:00Z'),
      assigned_at: new Date('2026-11-10T10:01:00Z'),
      picked_up_at: new Date('2026-11-10T10:15:00Z'),
      delivered_at: new Date('2026-11-10T10:40:00Z'),
      cancelled_at: null,
      cancel_reason: null,
      cancelled_by: null,
      rating: 5,
      // Detail-only columns
      pickup_gps_code: 'WS-123-4567',
      pickup_contact_name: 'Esi Owusu',
      pickup_contact_phone: '+233201112222',
      dropoff_gps_code: null,
      receiver_name: 'Ama',
      receiver_phone: '+233209998888',
      notes: 'Call on arrival',
      duration_s: 900,
      base_fare_pesewas: 1800,
      distance_fare_pesewas: 550,
      payment_method: 'CASH',
      rating_tags: ['FAST'],
      rating_comment: 'Great',
      rated_at: new Date('2026-11-10T11:00:00Z'),
      pin_attempts: 1,
      has_package_photo: true,
      // Columns an accidental SELECT * would return: must never reach the response.
      delivery_pin: '1234',
      package_photo_path: 'orders/x/photo.jpg',
      ...over,
    };
  }

  /** Routes each SQL statement to canned rows by recognisable fragments (first match wins). */
  function setup(rows: [string, unknown[]][]): {
    service: AdminOperationsService;
    query: jest.Mock;
  } {
    const query = jest.fn(async (sql: string) => {
      const hit = rows.find(([k]) => sql.includes(k));
      return { rows: hit ? hit[1] : [] };
    });
    return {
      service: new AdminOperationsService({ query } as unknown as DatabaseService),
      query,
    };
  }

  describe('query parsing', () => {
    it('maps status filters to groups and ignores junk', () => {
      expect(parseDeliveryFilter('active')).toBe('ACTIVE');
      expect(parseDeliveryFilter('Delivered')).toBe('DELIVERED');
      expect(parseDeliveryFilter('cancelled')).toBe('CANCELLED');
      expect(parseDeliveryFilter('no_rider')).toBe('CANCELLED');
      expect(parseDeliveryFilter("'; DROP TABLE x")).toBeNull();
      expect(parseDeliveryFilter('constructor')).toBeNull();
      expect(parseDeliveryFilter(undefined)).toBeNull();
    });

    it('clamps page numbers', () => {
      expect(parsePage(undefined)).toBe(1);
      expect(parsePage('0')).toBe(1);
      expect(parsePage('-4')).toBe(1);
      expect(parsePage('abc')).toBe(1);
      expect(parsePage('3')).toBe(3);
      expect(parsePage('99999999')).toBe(10000);
    });

    it('normalises Ghanaian phone input to the digits stored after +233', () => {
      expect(phoneDigits('024 123 4567')).toBe('241234567');
      expect(phoneDigits('+233241234567')).toBe('233241234567');
      expect(phoneDigits('GD-AB12')).toBeNull();
      expect(phoneDigits('12')).toBeNull();
    });
  });

  describe('listDeliveries', () => {
    it('filters by status group, searches code/name/phone, and pages', async () => {
      const { service, query } = setup([
        ['COUNT(*)::int AS n', [{ n: 60 }]],
        ['ORDER BY o.requested_at DESC', [orderRow()]],
      ]);

      const res = await service.listDeliveries({ filter: 'ACTIVE', q: '024 123 4567', page: 3 });

      expect(res).toMatchObject({ total: 60, page: 3, pageSize: ADMIN_PAGE_SIZE });
      expect(res.items[0]).toMatchObject({
        code: 'GD-ABC123',
        customerName: 'Esi Owusu',
        riderName: 'Kofi Mensah',
        farePesewas: 2350,
        pickup: { lat: 4.896, lng: -1.755, address: 'Market Circle', landmark: null },
        deliveredAt: '2026-11-10T10:40:00.000Z',
        rating: 5,
      });

      const [listSql, listParams] = query.mock.calls.find(([s]) => s.includes('LIMIT'))!;
      expect(listSql).toContain('o.status = ANY($1)');
      expect(listSql).toContain('o.code ILIKE $2');
      expect(listSql).toContain('c.phone_number LIKE $4');
      expect(listParams).toEqual([
        ['SEARCHING', 'ASSIGNED', 'PICKED_UP'],
        '%024 123 4567%',
        '%024 123 4567%',
        '%241234567%',
        ADMIN_PAGE_SIZE,
        2 * ADMIN_PAGE_SIZE,
      ]);
      const [countSql, countParams] = query.mock.calls.find(([s]) => s.includes('COUNT(*)'))!;
      expect(countSql).not.toContain('LIMIT');
      expect(countParams).toHaveLength(4);
    });

    it('groups NO_RIDER with cancelled and escapes LIKE wildcards', async () => {
      const { service, query } = setup([]);
      await service.listDeliveries({ filter: 'CANCELLED', q: '50%_off', page: 1 });
      const [, params] = query.mock.calls.find(([s]) => s.includes('LIMIT'))!;
      expect(params[0]).toEqual(['CANCELLED', 'NO_RIDER']);
      expect(params[1]).toBe('%50\\%\\_off%');
    });

    it('lists everything without a filter or search', async () => {
      const { service, query } = setup([]);
      const res = await service.listDeliveries({ filter: null, q: '  ', page: 1 });
      expect(res).toEqual({ items: [], total: 0, page: 1, pageSize: ADMIN_PAGE_SIZE });
      const [sql, params] = query.mock.calls.find(([s]) => s.includes('LIMIT'))!;
      expect(sql).not.toContain('WHERE');
      expect(params).toEqual([ADMIN_PAGE_SIZE, 0]);
    });

    it('never selects the delivery PIN or photo path', async () => {
      const { service, query } = setup([['ORDER BY o.requested_at DESC', [orderRow()]]]);
      const res = await service.listDeliveries({ filter: null, page: 1 });
      for (const [sql] of query.mock.calls) {
        expect(sql).not.toMatch(/delivery_pin|SELECT \*|o\.\*/);
      }
      expect(JSON.stringify(res)).not.toMatch(/1234"|photo\.jpg|deliveryPin|packagePhotoPath/);
    });
  });

  describe('getDelivery', () => {
    it('returns contacts, fare split, offers and an ordered timeline without secrets', async () => {
      const { service, query } = setup([
        [
          'FROM order_offers',
          [
            {
              id: 'f1',
              rider_id: 'r9',
              rider_name: 'Yaw',
              status: 'EXPIRED',
              distance_to_pickup_m: 800,
              offered_at: new Date('2026-11-10T10:00:10Z'),
              expires_at: new Date('2026-11-10T10:00:40Z'),
              responded_at: new Date('2026-11-10T10:00:40Z'),
            },
            {
              id: 'f2',
              rider_id: RIDER,
              rider_name: 'Kofi Mensah',
              status: 'ACCEPTED',
              distance_to_pickup_m: 1500,
              offered_at: new Date('2026-11-10T10:00:45Z'),
              expires_at: new Date('2026-11-10T10:01:15Z'),
              responded_at: new Date('2026-11-10T10:01:00Z'),
            },
          ],
        ],
        ['WHERE o.id = $1', [orderRow()]],
      ]);

      const d = await service.getDelivery(ORDER);

      expect(d.pickup).toMatchObject({ gpsCode: 'WS-123-4567', contactName: 'Esi Owusu' });
      expect(d.dropoff).toMatchObject({ contactName: 'Ama', contactPhone: '+233209998888' });
      expect(d).toMatchObject({
        baseFarePesewas: 1800,
        distanceFarePesewas: 550,
        pinAttempts: 1,
        hasPackagePhoto: true,
        ratingTags: ['FAST'],
      });
      expect(d.offers.map((o) => o.status)).toEqual(['EXPIRED', 'ACCEPTED']);
      expect(d.timeline.map((e) => e.kind)).toEqual([
        'REQUESTED',
        'OFFERED',
        'OFFER_EXPIRED',
        'OFFERED',
        'OFFER_ACCEPTED',
        'ASSIGNED',
        'PICKED_UP',
        'DELIVERED',
        'RATED',
      ]);
      expect(d.timeline[1]).toMatchObject({ title: 'Offered to Yaw', detail: '0.8 km from pickup' });

      expect(JSON.stringify(d)).not.toMatch(/"1234"|photo\.jpg|deliveryPin|packagePhotoPath/);
      for (const [sql] of query.mock.calls) expect(sql).not.toMatch(/delivery_pin|SELECT \*/);
    });

    it('shows a no-rider ending', async () => {
      const { service } = setup([
        [
          'WHERE o.id = $1',
          [
            orderRow({
              status: 'NO_RIDER',
              rider_id: null,
              rider_name: null,
              assigned_at: null,
              picked_up_at: null,
              delivered_at: null,
              rating: null,
              rated_at: null,
              cancelled_by: 'SYSTEM',
              cancel_reason: 'No rider was available',
              cancelled_at: new Date('2026-11-10T10:05:00Z'),
            }),
          ],
        ],
      ]);
      const d = await service.getDelivery(ORDER);
      expect(d.timeline.map((e) => e.kind)).toEqual(['REQUESTED', 'NO_RIDER']);
      expect(d.timeline[1]).toMatchObject({
        title: 'No rider found',
        detail: 'No rider was available',
      });
    });

    it('404s an unknown order', async () => {
      await expect(setup([]).service.getDelivery(ORDER)).rejects.toThrow(NotFoundException);
    });
  });

  describe('customers', () => {
    const customerRow = {
      id: CUSTOMER,
      full_name: 'Esi Owusu',
      phone_number: '+233201112222',
      email: 'esi@example.com',
      created_at: new Date('2026-11-01T08:00:00Z'),
      deliveries: 4,
      delivered: 2,
      cancelled: 1,
      active: 1,
      delivered_fare: '4700',
      last_delivery_at: new Date('2026-11-10T10:00:00Z'),
    };

    it('lists customers with order counts and searches name/email/phone', async () => {
      const { service, query } = setup([
        ['COUNT(*)::int AS n FROM customers', [{ n: 1 }]],
        ['ORDER BY c.created_at DESC', [customerRow, { ...customerRow, id: 'c2', deliveries: null, last_delivery_at: null }]],
      ]);
      const res = await service.listCustomers({ q: '0201112222', page: 1 });
      expect(res.total).toBe(1);
      expect(res.items[0]).toEqual({
        id: CUSTOMER,
        fullName: 'Esi Owusu',
        phoneNumber: '+233201112222',
        email: 'esi@example.com',
        createdAt: '2026-11-01T08:00:00.000Z',
        deliveries: 4,
        delivered: 2,
        lastDeliveryAt: '2026-11-10T10:00:00.000Z',
      });
      expect(res.items[1]).toMatchObject({ deliveries: 0, lastDeliveryAt: null });
      const [sql, params] = query.mock.calls.find(([s]) => s.includes('LIMIT'))!;
      expect(sql).toContain('c.phone_number LIKE $2');
      expect(params).toEqual(['%0201112222%', '%201112222%', ADMIN_PAGE_SIZE, 0]);
    });

    it("returns one customer's totals and order history", async () => {
      const { service } = setup([
        ['WHERE o.customer_id = $1', [orderRow()]],
        ['WHERE c.id = $1', [customerRow]],
      ]);
      const c = await service.getCustomer(CUSTOMER);
      expect(c).toMatchObject({ cancelled: 1, active: 1, deliveredFarePesewas: 4700 });
      expect(c.orders).toHaveLength(1);
      expect(c.orders[0].code).toBe('GD-ABC123');
      expect(JSON.stringify(c)).not.toMatch(/"1234"|photo\.jpg/);
    });

    it('404s an unknown customer', async () => {
      await expect(setup([]).service.getCustomer(CUSTOMER)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getLive', () => {
    it('uses the 60 s presence freshness rule and flags riders on a job', async () => {
      const { service, query } = setup([
        [
          'FROM rider_presence',
          [
            {
              id: RIDER,
              full_name: 'Kofi Mensah',
              phone_number: '+233241234567',
              latitude: '4.9',
              longitude: '-1.76',
              heading: null,
              updated_at: new Date(),
              job_id: ORDER,
              job_code: 'GD-ABC123',
              job_status: 'PICKED_UP',
            },
            {
              id: 'r2',
              full_name: 'Yaw',
              phone_number: '+233240000000',
              latitude: 4.91,
              longitude: -1.75,
              heading: 90,
              updated_at: new Date(),
              job_id: null,
              job_code: null,
              job_status: null,
            },
          ],
        ],
        ["o.status IN ('SEARCHING','ASSIGNED','PICKED_UP')", [orderRow({ status: 'PICKED_UP' })]],
      ]);

      const live = await service.getLive();

      const [presenceSql, presenceParams] = query.mock.calls.find(([s]) =>
        s.includes('rider_presence'),
      )!;
      expect(presenceSql).toContain('p.is_online');
      expect(presenceSql).toContain('p.updated_at > NOW() - make_interval(secs => $1)');
      expect(presenceParams).toEqual([60]);

      expect(live.riders[0]).toMatchObject({
        lat: 4.9,
        lng: -1.76,
        job: { orderId: ORDER, code: 'GD-ABC123', status: 'PICKED_UP' },
      });
      expect(live.riders[1]).toMatchObject({ heading: 90, job: null });
      expect(live.deliveries[0]).toMatchObject({
        code: 'GD-ABC123',
        status: 'PICKED_UP',
        pickup: { lat: 4.896, lng: -1.755 },
        dropoff: { lat: 4.93, lng: -1.77 },
      });
      expect(JSON.stringify(live)).not.toMatch(/"1234"|photo\.jpg/);
    });
  });
});
