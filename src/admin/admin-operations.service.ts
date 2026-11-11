import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PRESENCE_FRESH_SECONDS } from '../orders/dispatch.service';
import {
  AdminCustomer,
  AdminCustomerDetail,
  AdminDelivery,
  AdminDeliveryDetail,
  AdminLiveSnapshot,
  AdminOffer,
  DeliveryEvent,
  DeliveryFilter,
  DeliveryStatus,
  Paged,
} from './admin.types';

export const ADMIN_PAGE_SIZE = 25;
const MAX_PAGE = 10_000;
const MAX_QUERY_LENGTH = 60;

const FILTER_STATUSES: Record<DeliveryFilter, DeliveryStatus[]> = {
  ACTIVE: ['SEARCHING', 'ASSIGNED', 'PICKED_UP'],
  DELIVERED: ['DELIVERED'],
  CANCELLED: ['CANCELLED', 'NO_RIDER'],
};

const iso = (v: Date | string | null): string | null => (v ? new Date(v).toISOString() : null);
const isoReq = (v: Date | string): string => new Date(v).toISOString();

/** Parses ?status= into a filter group; anything unknown means "all". */
export function parseDeliveryFilter(raw: string | undefined): DeliveryFilter | null {
  const v = raw?.trim().toUpperCase();
  if (v === 'NO_RIDER') return 'CANCELLED';
  return v && v in FILTER_STATUSES ? (v as DeliveryFilter) : null;
}

/** Parses ?page= (1-based); junk or out-of-range values clamp to a valid page. */
export function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE);
}

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, '\\$&');

/**
 * Phone digits to match against stored E.164 numbers (+233...): "024 123 4567" and
 * "+233241234567" both become "241234567". Too short to be useful returns null.
 */
export function phoneDigits(q: string): string | null {
  let digits = q.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  return digits.length >= 4 ? digits : null;
}

type SqlValue = string | number | string[];

/** Builds a parameterised WHERE clause. `params` is appended to in place. */
class Where {
  private readonly parts: string[] = [];
  constructor(readonly params: SqlValue[]) {}
  param(value: SqlValue): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }
  add(sql: string): void {
    this.parts.push(sql);
  }
  toString(): string {
    return this.parts.length ? `WHERE ${this.parts.join(' AND ')}` : '';
  }
}

interface DeliveryRow {
  id: string;
  code: string;
  status: DeliveryStatus;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  rider_id: string | null;
  rider_name: string | null;
  rider_phone: string | null;
  fare_pesewas: number;
  package_type: string;
  fragile: boolean;
  distance_m: number;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  pickup_landmark: string | null;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  dropoff_landmark: string | null;
  requested_at: Date;
  assigned_at: Date | null;
  picked_up_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  rating: number | null;
}

interface DeliveryDetailRow extends DeliveryRow {
  pickup_gps_code: string | null;
  pickup_contact_name: string;
  pickup_contact_phone: string;
  dropoff_gps_code: string | null;
  receiver_name: string;
  receiver_phone: string;
  notes: string | null;
  duration_s: number;
  base_fare_pesewas: number;
  distance_fare_pesewas: number;
  payment_method: string;
  rating_tags: string[] | null;
  rating_comment: string | null;
  rated_at: Date | null;
  pin_attempts: number;
  has_package_photo: boolean;
}

/**
 * Explicit column list: the admin portal must never receive delivery_pin or
 * package_photo_path, so this never uses SELECT *.
 */
const DELIVERY_COLUMNS = `
  o.id, o.code, o.status, o.customer_id, c.full_name AS customer_name, c.phone_number AS customer_phone,
  o.rider_id, r.full_name AS rider_name, r.phone_number AS rider_phone,
  o.fare_pesewas, o.package_type, o.fragile, o.distance_m,
  o.pickup_lat, o.pickup_lng, o.pickup_address, o.pickup_landmark,
  o.dropoff_lat, o.dropoff_lng, o.dropoff_address, o.dropoff_landmark,
  o.requested_at, o.assigned_at, o.picked_up_at, o.delivered_at, o.cancelled_at,
  o.cancel_reason, o.cancelled_by, o.rating`;

const DELIVERY_FROM = `
  FROM delivery_orders o
  JOIN customers c ON c.id = o.customer_id
  LEFT JOIN riders r ON r.id = o.rider_id`;

function mapDelivery(r: DeliveryRow): AdminDelivery {
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    riderId: r.rider_id,
    riderName: r.rider_name,
    riderPhone: r.rider_phone,
    farePesewas: Number(r.fare_pesewas),
    packageType: r.package_type,
    fragile: r.fragile,
    distanceMeters: Number(r.distance_m),
    pickup: {
      lat: Number(r.pickup_lat),
      lng: Number(r.pickup_lng),
      address: r.pickup_address,
      landmark: r.pickup_landmark,
    },
    dropoff: {
      lat: Number(r.dropoff_lat),
      lng: Number(r.dropoff_lng),
      address: r.dropoff_address,
      landmark: r.dropoff_landmark,
    },
    requestedAt: isoReq(r.requested_at),
    assignedAt: iso(r.assigned_at),
    pickedUpAt: iso(r.picked_up_at),
    deliveredAt: iso(r.delivered_at),
    cancelledAt: iso(r.cancelled_at),
    cancelReason: r.cancel_reason,
    cancelledBy: r.cancelled_by,
    rating: r.rating === null ? null : Number(r.rating),
  };
}

const km = (m: number): string => `${(m / 1000).toFixed(1)} km`;

/** Order lifecycle plus every dispatch offer, oldest first. */
export function buildTimeline(o: AdminDeliveryDetail, ratedAt: string | null): DeliveryEvent[] {
  const events: DeliveryEvent[] = [
    { kind: 'REQUESTED', title: 'Order placed', detail: `by ${o.customerName}`, at: o.requestedAt },
  ];
  for (const f of o.offers) {
    events.push({
      kind: 'OFFERED',
      title: `Offered to ${f.riderName}`,
      detail: `${km(f.distanceToPickupMeters)} from pickup`,
      at: f.offeredAt,
    });
    if (f.status !== 'OFFERED' && f.respondedAt) {
      const outcome: Record<string, [DeliveryEvent['kind'], string]> = {
        ACCEPTED: ['OFFER_ACCEPTED', `${f.riderName} accepted`],
        DECLINED: ['OFFER_DECLINED', `${f.riderName} declined`],
        EXPIRED: ['OFFER_EXPIRED', `Offer to ${f.riderName} expired`],
        WITHDRAWN: ['OFFER_WITHDRAWN', `Offer to ${f.riderName} withdrawn`],
      };
      const [kind, title] = outcome[f.status];
      events.push({ kind, title, detail: null, at: f.respondedAt });
    }
  }
  if (o.assignedAt) {
    events.push({
      kind: 'ASSIGNED',
      title: 'Rider assigned',
      detail: o.riderName,
      at: o.assignedAt,
    });
  }
  if (o.pickedUpAt) {
    events.push({ kind: 'PICKED_UP', title: 'Package picked up', detail: null, at: o.pickedUpAt });
  }
  if (o.deliveredAt) {
    events.push({
      kind: 'DELIVERED',
      title: 'Delivered',
      detail: 'Handover PIN confirmed',
      at: o.deliveredAt,
    });
  }
  if (o.cancelledAt) {
    const noRider = o.status === 'NO_RIDER';
    events.push({
      kind: noRider ? 'NO_RIDER' : 'CANCELLED',
      title: noRider
        ? 'No rider found'
        : `Cancelled${o.cancelledBy ? ` by ${o.cancelledBy.toLowerCase()}` : ''}`,
      detail: o.cancelReason,
      at: o.cancelledAt,
    });
  }
  if (o.rating !== null && ratedAt) {
    events.push({
      kind: 'RATED',
      title: `Rated ${o.rating}/5`,
      detail: o.ratingComment,
      at: ratedAt,
    });
  }
  // Stable sort keeps lifecycle order for events that share a timestamp.
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => Date.parse(a.e.at) - Date.parse(b.e.at) || a.i - b.i)
    .map((x) => x.e);
}

/** Read-only queries behind the Deliveries, Customers and Live map pages. */
@Injectable()
export class AdminOperationsService {
  constructor(private readonly db: DatabaseService) {}

  async listDeliveries(opts: {
    filter: DeliveryFilter | null;
    q?: string;
    page: number;
  }): Promise<Paged<AdminDelivery>> {
    const where = new Where([]);
    if (opts.filter) where.add(`o.status = ANY(${where.param(FILTER_STATUSES[opts.filter])})`);
    const q = opts.q?.trim().slice(0, MAX_QUERY_LENGTH);
    if (q) {
      const ors = [
        `o.code ILIKE ${where.param(`%${escapeLike(q)}%`)}`,
        `c.full_name ILIKE ${where.param(`%${escapeLike(q)}%`)}`,
      ];
      const digits = phoneDigits(q);
      if (digits) {
        const p = where.param(`%${digits}%`);
        ors.push(
          `c.phone_number LIKE ${p}`,
          `o.receiver_phone LIKE ${p}`,
          `o.pickup_contact_phone LIKE ${p}`,
          `r.phone_number LIKE ${p}`,
        );
      }
      where.add(`(${ors.join(' OR ')})`);
    }
    return this.pagedDeliveries(where, opts.page);
  }

  async getDelivery(id: string): Promise<AdminDeliveryDetail> {
    const [res, offers] = await Promise.all([
      this.db.query<DeliveryDetailRow>(
        `SELECT ${DELIVERY_COLUMNS},
                o.pickup_gps_code, o.pickup_contact_name, o.pickup_contact_phone,
                o.dropoff_gps_code, o.receiver_name, o.receiver_phone, o.notes, o.duration_s,
                o.base_fare_pesewas, o.distance_fare_pesewas, o.payment_method,
                o.rating_tags, o.rating_comment, o.rated_at, o.pin_attempts,
                (o.package_photo_path IS NOT NULL) AS has_package_photo
         ${DELIVERY_FROM}
         WHERE o.id = $1`,
        [id],
      ),
      this.db.query<{
        id: string;
        rider_id: string;
        rider_name: string;
        status: AdminOffer['status'];
        distance_to_pickup_m: number;
        offered_at: Date;
        expires_at: Date;
        responded_at: Date | null;
      }>(
        `SELECT f.id, f.rider_id, r.full_name AS rider_name, f.status, f.distance_to_pickup_m,
                f.offered_at, f.expires_at, f.responded_at
         FROM order_offers f JOIN riders r ON r.id = f.rider_id
         WHERE f.order_id = $1
         ORDER BY f.offered_at ASC`,
        [id],
      ),
    ]);
    const row = res.rows[0];
    if (!row) throw new NotFoundException(`Delivery ${id} not found`);
    const base = mapDelivery(row);
    const detail: AdminDeliveryDetail = {
      ...base,
      pickup: {
        ...base.pickup,
        gpsCode: row.pickup_gps_code,
        contactName: row.pickup_contact_name,
        contactPhone: row.pickup_contact_phone,
      },
      dropoff: {
        ...base.dropoff,
        gpsCode: row.dropoff_gps_code,
        contactName: row.receiver_name,
        contactPhone: row.receiver_phone,
      },
      notes: row.notes,
      durationSeconds: Number(row.duration_s),
      baseFarePesewas: Number(row.base_fare_pesewas),
      distanceFarePesewas: Number(row.distance_fare_pesewas),
      paymentMethod: row.payment_method,
      ratingTags: row.rating_tags,
      ratingComment: row.rating_comment,
      pinAttempts: Number(row.pin_attempts ?? 0),
      hasPackagePhoto: Boolean(row.has_package_photo),
      timeline: [],
      offers: offers.rows.map((f) => ({
        id: f.id,
        riderId: f.rider_id,
        riderName: f.rider_name,
        status: f.status,
        distanceToPickupMeters: Number(f.distance_to_pickup_m),
        offeredAt: isoReq(f.offered_at),
        expiresAt: isoReq(f.expires_at),
        respondedAt: iso(f.responded_at),
      })),
    };
    detail.timeline = buildTimeline(detail, iso(row.rated_at));
    return detail;
  }

  async listCustomers(opts: { q?: string; page: number }): Promise<Paged<AdminCustomer>> {
    const where = new Where([]);
    const q = opts.q?.trim().slice(0, MAX_QUERY_LENGTH);
    if (q) {
      const like = where.param(`%${escapeLike(q)}%`);
      const ors = [`c.full_name ILIKE ${like}`, `c.email ILIKE ${like}`];
      const digits = phoneDigits(q);
      if (digits) ors.push(`c.phone_number LIKE ${where.param(`%${digits}%`)}`);
      where.add(`(${ors.join(' OR ')})`);
    }
    const filterParams = [...where.params];
    const limit = where.param(ADMIN_PAGE_SIZE);
    const offset = where.param((opts.page - 1) * ADMIN_PAGE_SIZE);
    const [rows, count] = await Promise.all([
      this.db.query<CustomerRow>(
        `SELECT ${CUSTOMER_COLUMNS}
         FROM customers c ${CUSTOMER_STATS_JOIN}
         ${where}
         ORDER BY c.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        where.params,
      ),
      this.db.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM customers c ${where}`,
        filterParams,
      ),
    ]);
    return {
      items: rows.rows.map(mapCustomer),
      total: count.rows[0]?.n ?? 0,
      page: opts.page,
      pageSize: ADMIN_PAGE_SIZE,
    };
  }

  async getCustomer(id: string): Promise<AdminCustomerDetail> {
    const [res, orders] = await Promise.all([
      this.db.query<CustomerRow>(
        `SELECT ${CUSTOMER_COLUMNS}
         FROM customers c ${CUSTOMER_STATS_JOIN}
         WHERE c.id = $1`,
        [id],
      ),
      this.db.query<DeliveryRow>(
        `SELECT ${DELIVERY_COLUMNS} ${DELIVERY_FROM}
         WHERE o.customer_id = $1
         ORDER BY o.requested_at DESC
         LIMIT 100`,
        [id],
      ),
    ]);
    const row = res.rows[0];
    if (!row) throw new NotFoundException(`Customer ${id} not found`);
    return {
      ...mapCustomer(row),
      cancelled: Number(row.cancelled ?? 0),
      active: Number(row.active ?? 0),
      deliveredFarePesewas: Number(row.delivered_fare ?? 0),
      orders: orders.rows.map(mapDelivery),
    };
  }

  /**
   * Riders online right now (fresh presence, same rule as dispatch) and every active order.
   * Unlike the customer-facing nearby view, positions are exact: admins need them for support.
   */
  async getLive(): Promise<AdminLiveSnapshot> {
    const [riders, deliveries] = await Promise.all([
      this.db.query<{
        id: string;
        full_name: string;
        phone_number: string;
        latitude: number;
        longitude: number;
        heading: number | null;
        updated_at: Date;
        job_id: string | null;
        job_code: string | null;
        job_status: DeliveryStatus | null;
      }>(
        `SELECT r.id, r.full_name, r.phone_number, p.latitude, p.longitude, p.heading, p.updated_at,
                j.id AS job_id, j.code AS job_code, j.status AS job_status
         FROM rider_presence p
         JOIN riders r ON r.id = p.rider_id AND r.onboarding_status = 'ACTIVE'
         LEFT JOIN delivery_orders j ON j.rider_id = p.rider_id AND j.status IN ('ASSIGNED','PICKED_UP')
         WHERE p.is_online AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
           AND p.updated_at > NOW() - make_interval(secs => $1)
         ORDER BY r.full_name`,
        [PRESENCE_FRESH_SECONDS],
      ),
      this.db.query<DeliveryRow>(
        `SELECT ${DELIVERY_COLUMNS} ${DELIVERY_FROM}
         WHERE o.status IN ('SEARCHING','ASSIGNED','PICKED_UP')
         ORDER BY o.requested_at ASC
         LIMIT 500`,
      ),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      riders: riders.rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        phoneNumber: r.phone_number,
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        heading: r.heading === null ? null : Number(r.heading),
        updatedAt: isoReq(r.updated_at),
        job:
          r.job_id && r.job_code && r.job_status
            ? { orderId: r.job_id, code: r.job_code, status: r.job_status }
            : null,
      })),
      deliveries: deliveries.rows.map((row) => {
        const d = mapDelivery(row);
        return {
          id: d.id,
          code: d.code,
          status: d.status,
          riderId: d.riderId,
          riderName: d.riderName,
          customerName: d.customerName,
          farePesewas: d.farePesewas,
          pickup: d.pickup,
          dropoff: d.dropoff,
          requestedAt: d.requestedAt,
        };
      }),
    };
  }

  private async pagedDeliveries(where: Where, page: number): Promise<Paged<AdminDelivery>> {
    const filterParams = [...where.params];
    const limit = where.param(ADMIN_PAGE_SIZE);
    const offset = where.param((page - 1) * ADMIN_PAGE_SIZE);
    const [rows, count] = await Promise.all([
      this.db.query<DeliveryRow>(
        `SELECT ${DELIVERY_COLUMNS} ${DELIVERY_FROM}
         ${where}
         ORDER BY o.requested_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        where.params,
      ),
      this.db.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n ${DELIVERY_FROM} ${where}`,
        filterParams,
      ),
    ]);
    return {
      items: rows.rows.map(mapDelivery),
      total: count.rows[0]?.n ?? 0,
      page,
      pageSize: ADMIN_PAGE_SIZE,
    };
  }
}

interface CustomerRow {
  id: string;
  full_name: string;
  phone_number: string;
  email: string | null;
  created_at: Date;
  deliveries: number | null;
  delivered: number | null;
  cancelled: number | null;
  active: number | null;
  delivered_fare: string | null;
  last_delivery_at: Date | null;
}

const CUSTOMER_COLUMNS = `
  c.id, c.full_name, c.phone_number, c.email, c.created_at,
  s.deliveries, s.delivered, s.cancelled, s.active, s.delivered_fare, s.last_delivery_at`;

const CUSTOMER_STATS_JOIN = `
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS deliveries,
           COUNT(*) FILTER (WHERE o.status = 'DELIVERED')::int AS delivered,
           COUNT(*) FILTER (WHERE o.status IN ('CANCELLED','NO_RIDER'))::int AS cancelled,
           COUNT(*) FILTER (WHERE o.status IN ('SEARCHING','ASSIGNED','PICKED_UP'))::int AS active,
           COALESCE(SUM(o.fare_pesewas) FILTER (WHERE o.status = 'DELIVERED'), 0)::text AS delivered_fare,
           MAX(o.requested_at) AS last_delivery_at
    FROM delivery_orders o WHERE o.customer_id = c.id
  ) s ON TRUE`;

function mapCustomer(r: CustomerRow): AdminCustomer {
  return {
    id: r.id,
    fullName: r.full_name,
    phoneNumber: r.phone_number,
    email: r.email,
    createdAt: isoReq(r.created_at),
    deliveries: Number(r.deliveries ?? 0),
    delivered: Number(r.delivered ?? 0),
    lastDeliveryAt: iso(r.last_delivery_at),
  };
}
