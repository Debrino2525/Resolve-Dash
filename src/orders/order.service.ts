import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { SignedTokens } from '../common/signed-token';
import { CustomerRepository } from '../customers/customer.repository';
import { DatabaseService } from '../database/database.service';
import { DispatchService } from './dispatch.service';
import { haversineMeters, isInGhana, LatLng, roadEstimate } from './geo';
import { OrderCallService } from './order-call.service';
import { DeliveryNotifier } from './delivery-notifier';
import { OrderRepository } from './order.repository';
import {
  CustomerOrderView,
  DeliveryOrder,
  ExtraStop,
  OrderStop,
  PackageType,
  RecentPlace,
  RATING_TAGS,
} from './order.types';
import { MAX_EXTRA_STOPS, priceTrip, readPricing } from './pricing';

export const QUOTE_TTL_MS = 10 * 60 * 1000;
export const MAX_ACTIVE_ORDERS = 3;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface QuoteResult {
  distanceMeters: number;
  durationSeconds: number;
  baseFarePesewas: number;
  distanceFarePesewas: number;
  /** Charge for drop-offs after the first (0 for a single drop-off). */
  stopsFarePesewas: number;
  farePesewas: number;
  /** Number of drop-offs priced, including the final one. */
  dropoffCount: number;
  estimated: boolean;
  quoteToken: string;
  expiresAt: string;
}

interface QuoteClaims {
  sub: string;
  p: [number, number];
  d: [number, number];
  /** Drop-offs before the final one (absent on quotes from before multi-stop). */
  s?: [number, number][];
  dm: number;
  ds: number;
  bf: number;
  df: number;
  sf?: number;
  f: number;
  exp: number;
}

export interface CreateOrderInput {
  pickup: OrderStop;
  dropoff: OrderStop;
  /** Drop-offs before the final one, in visiting order (must match the quote). */
  stops?: OrderStop[];
  packageType: PackageType;
  fragile: boolean;
  notes: string | null;
  quoteToken: string;
  /** Path returned by POST /orders/package-photo (must be in this user's own folder). */
  packagePhotoPath?: string | null;
}

const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;

@Injectable()
export class OrderService {
  private readonly quotes = new SignedTokens('ORDER_QUOTE_SECRET');

  constructor(
    private readonly db: DatabaseService,
    private readonly orders: OrderRepository,
    private readonly customers: CustomerRepository,
    private readonly dispatch: DispatchService,
    @Optional() private readonly calls?: OrderCallService,
    @Optional() private readonly notify?: DeliveryNotifier,
  ) {}

  async quote(
    userId: string,
    pickup: LatLng,
    dropoff: LatLng,
    via: LatLng[] = [],
    now = Date.now(),
  ): Promise<QuoteResult> {
    if (via.length > MAX_EXTRA_STOPS) {
      throw new BadRequestException(`Up to ${MAX_EXTRA_STOPS + 1} drop-offs per delivery`);
    }
    const route = [pickup, ...via, dropoff];
    if (!route.every(isInGhana)) {
      throw new BadRequestException(
        via.length
          ? 'Pickup and drop-offs must all be in Ghana'
          : 'Pickup and drop-off must both be in Ghana',
      );
    }
    if (route.slice(1).some((p) => haversineMeters(pickup, p) < 50)) {
      throw new BadRequestException(
        via.length ? 'A drop-off is at the pickup spot' : 'Pickup and drop-off are the same place',
      );
    }
    for (let i = 1; i < route.length - 1; i++) {
      if (haversineMeters(route[i], route[i + 1]) < 50) {
        throw new BadRequestException(
          'Two drop-offs in a row are the same place. Remove one of them.',
        );
      }
    }
    const road = await roadEstimate(pickup, dropoff, undefined, undefined, via);
    const fare = priceTrip(road.distanceMeters, readPricing(), via.length);
    const exp = now + QUOTE_TTL_MS;
    const claims: QuoteClaims = {
      sub: userId,
      p: [round5(pickup.lat), round5(pickup.lng)],
      d: [round5(dropoff.lat), round5(dropoff.lng)],
      s: via.map((v): [number, number] => [round5(v.lat), round5(v.lng)]),
      dm: road.distanceMeters,
      ds: road.durationSeconds,
      bf: fare.baseFarePesewas,
      df: fare.distanceFarePesewas,
      sf: fare.stopsFarePesewas,
      f: fare.farePesewas,
      exp,
    };
    return {
      distanceMeters: road.distanceMeters,
      durationSeconds: road.durationSeconds,
      ...fare,
      dropoffCount: via.length + 1,
      estimated: road.estimated,
      quoteToken: this.quotes.sign(claims),
      expiresAt: new Date(exp).toISOString(),
    };
  }

  async create(
    userId: string,
    input: CreateOrderInput,
    now = Date.now(),
  ): Promise<CustomerOrderView> {
    const customer = await this.customers.findById(userId);
    if (!customer) throw new ForbiddenException('Complete your profile before ordering');

    const q = this.quotes.verify<QuoteClaims>(input.quoteToken);
    const same = (a: [number, number], b: OrderStop): boolean =>
      a[0] === round5(b.lat) && a[1] === round5(b.lng);
    const stops = input.stops ?? [];
    const quotedStops = q?.s ?? [];
    const sameStops =
      quotedStops.length === stops.length && quotedStops.every((s, i) => same(s, stops[i]));
    if (
      !q ||
      q.sub !== userId ||
      !same(q.p, input.pickup) ||
      !same(q.d, input.dropoff) ||
      !sameStops
    ) {
      throw new BadRequestException(
        'This price quote does not match your trip. Please get a new quote.',
      );
    }
    if (q.exp <= now) {
      throw new BadRequestException('This price quote has expired. Please get a new quote.');
    }
    const photo = input.packagePhotoPath ?? null;
    if (photo && !isOwnPackagePhotoPath(userId, photo)) {
      throw new BadRequestException('That package photo could not be used. Please add it again.');
    }
    if ((await this.orders.countActiveForCustomer(userId)) >= MAX_ACTIVE_ORDERS) {
      throw new ConflictException(
        `You can have up to ${MAX_ACTIVE_ORDERS} active deliveries at a time.`,
      );
    }

    let order: DeliveryOrder | null = null;
    for (let attempt = 0; attempt < 5 && !order; attempt++) {
      try {
        order = await this.orders.insert({
          code: generateCode(),
          customerId: userId,
          pickup: input.pickup,
          dropoff: input.dropoff,
          extraStops: stops.map((s): ExtraStop => ({
            ...s,
            pin: newPin(),
            pinAttempts: 0,
            status: 'PENDING',
            doneAt: null,
            failReason: null,
          })),
          packageType: input.packageType,
          fragile: input.fragile,
          notes: input.notes,
          distanceMeters: q.dm,
          durationSeconds: q.ds,
          baseFarePesewas: q.bf,
          distanceFarePesewas: q.df,
          stopsFarePesewas: q.sf ?? 0,
          farePesewas: q.f,
          deliveryPin: newPin(),
          packagePhotoPath: photo,
        });
      } catch (err) {
        const pg = err as { code?: string; constraint?: string };
        if (!(pg.code === '23505' && (pg.constraint ?? '').includes('code'))) throw err;
      }
    }
    if (!order) throw new ConflictException('Could not create the order, please try again');

    this.dispatch.kick();
    return this.toView(order);
  }

  async list(userId: string): Promise<CustomerOrderView[]> {
    const orders = await this.orders.listForCustomer(userId);
    return Promise.all(orders.map((o) => this.toView(o, false)));
  }

  /**
   * The customer's own recent pickup and drop-off spots, newest first. Spots within 40 m of
   * each other count as one (the newest address and landmark win). Only their own orders.
   */
  async recentPlaces(userId: string, max = 6): Promise<RecentPlace[]> {
    const orders = await this.orders.listForCustomer(userId, 30);
    const out: RecentPlace[] = [];
    for (const o of orders) {
      // Drop-off first: it is the stop people most often send to again.
      for (const s of [o.dropoff, ...o.extraStops, o.pickup]) {
        if (out.some((p) => haversineMeters(p, s) < 40)) continue;
        out.push({
          lat: s.lat,
          lng: s.lng,
          address: s.address,
          landmark: s.landmark,
          gpsCode: s.gpsCode,
          lastUsedAt: o.requestedAt,
        });
        if (out.length >= max) return out;
      }
    }
    return out;
  }

  async get(userId: string, orderId: string): Promise<CustomerOrderView> {
    return this.toView(await this.requireOwn(userId, orderId));
  }

  async cancel(
    userId: string,
    orderId: string,
    reason: string | undefined,
  ): Promise<CustomerOrderView> {
    const before = await this.db.withTransaction(async (client) => {
      const order = await this.orders.lockById(client, orderId);
      if (!order || order.customerId !== userId) throw new NotFoundException('Order not found');
      if (order.status !== 'SEARCHING' && order.status !== 'ASSIGNED') {
        throw new ConflictException(
          order.status === 'PICKED_UP'
            ? 'The rider already has your package. Contact support to change this delivery.'
            : 'This delivery can no longer be cancelled.',
        );
      }
      await client.query(
        `UPDATE delivery_orders
         SET status = 'CANCELLED', cancelled_by = 'CUSTOMER', cancel_reason = $2, cancelled_at = NOW()
         WHERE id = $1`,
        [orderId, reason?.trim() || 'Cancelled by customer'],
      );
      await client.query(
        `UPDATE order_offers SET status = 'WITHDRAWN', responded_at = NOW()
         WHERE order_id = $1 AND status = 'OFFERED'`,
        [orderId],
      );
      return order;
    });
    if (before.status === 'ASSIGNED') this.notify?.customerCancelled(before);
    return this.get(userId, orderId);
  }

  async rate(
    userId: string,
    orderId: string,
    stars: number,
    tags: string[],
    comment: string | undefined,
  ): Promise<CustomerOrderView> {
    const order = await this.requireOwn(userId, orderId);
    if (order.status !== 'DELIVERED')
      throw new ConflictException('You can rate a delivery once it is complete.');
    if (order.rating !== null) throw new ConflictException('You already rated this delivery.');
    const allowed = new Set<string>(RATING_TAGS);
    const cleanTags = [...new Set(tags)].filter((t) => allowed.has(t));
    await this.db.query(
      `UPDATE delivery_orders SET rating = $2, rating_tags = $3, rating_comment = $4, rated_at = NOW()
       WHERE id = $1 AND rating IS NULL`,
      [orderId, stars, cleanTags, comment?.trim() || null],
    );
    return this.get(userId, orderId);
  }

  /** Online, available riders within 5 km, positions rounded to ~100 m for the riders' privacy. */
  async nearbyRiders(
    at: LatLng,
  ): Promise<{ count: number; riders: { lat: number; lng: number }[] }> {
    const res = await this.db.query<{ latitude: number; longitude: number }>(
      `SELECT p.latitude, p.longitude FROM rider_presence p
       JOIN riders r ON r.id = p.rider_id AND r.onboarding_status = 'ACTIVE'
       WHERE p.is_online AND p.updated_at > NOW() - INTERVAL '60 seconds' AND p.latitude IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM delivery_orders o
                         WHERE o.rider_id = p.rider_id AND o.status IN ('ASSIGNED','PICKED_UP'))`,
    );
    const riders = res.rows
      .map((r) => ({ lat: Number(r.latitude), lng: Number(r.longitude) }))
      .filter((r) => haversineMeters(at, r) <= 5000)
      .map((r) => ({ lat: Math.round(r.lat * 1000) / 1000, lng: Math.round(r.lng * 1000) / 1000 }));
    return { count: riders.length, riders };
  }

  private async requireOwn(userId: string, orderId: string): Promise<DeliveryOrder> {
    const order = await this.orders.findById(orderId);
    if (!order || order.customerId !== userId) throw new NotFoundException('Order not found');
    return order;
  }

  private async toView(order: DeliveryOrder, withRider = true): Promise<CustomerOrderView> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pinAttempts, customerId, packagePhotoPath, extraStops, ...rest } = order;

    const stops = extraStops.map(({ pinAttempts: _tries, ...s }, index) => ({ ...s, index }));
    const showRider =
      withRider && order.riderId && ['ASSIGNED', 'PICKED_UP', 'DELIVERED'].includes(order.status);
    const rider = showRider ? await this.orders.assignedRider(order.riderId as string) : null;
    // Live position only while the rider is actually on this job.
    if (rider && order.status === 'DELIVERED') rider.location = null;
    const messageCount = order.riderId ? await this.orders.messageCount(order.id) : 0;
    const call = this.calls?.summaryFor(order.id, 'CUSTOMER', order.status) ?? null;
    return {
      ...rest,
      stops,
      rider,
      hasPackagePhoto: Boolean(packagePhotoPath),
      messageCount,
      call,
    };
  }
}

/** Package photos are uploaded by the customer into <their uid>/package/<uuid>.<ext>. */
export function isOwnPackagePhotoPath(userId: string, path: string): boolean {
  return new RegExp(
    `^${userId}/package/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$`,
  ).test(path);
}

function newPin(): string {
  return crypto.randomInt(0, 10_000).toString().padStart(4, '0');
}

export function generateCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  return `GD-${s}`;
}
