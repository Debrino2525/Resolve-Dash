import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { DispatchService } from './dispatch.service';
import { OrderCallService } from './order-call.service';
import { OrderRepository } from './order.repository';
import { DeliveryOrder, PackageType, RiderJobView, RiderOfferView } from './order.types';

export const MAX_PIN_ATTEMPTS = 5;

export interface PresenceInput {
  online: boolean;
  lat?: number;
  lng?: number;
  heading?: number | null;
  accuracy?: number | null;
}

export interface DispatchState {
  online: boolean;
  offer: RiderOfferView | null;
  job: RiderJobView | null;
  /** Deliveries completed today (Africa/Accra = UTC) and the cash collected for them. */
  today: { completed: number; cashPesewas: number };
}

interface OfferRow {
  id: string;
  order_id: string;
  expires_at: Date;
  distance_to_pickup_m: number;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  pickup_landmark: string | null;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  dropoff_landmark: string | null;
  package_type: PackageType;
  fragile: boolean;
  distance_m: number;
  duration_s: number;
  fare_pesewas: number;
  has_package_photo: boolean;
}

/** Rider side of dispatch: going online, offers, and moving a job through to delivery. */
@Injectable()
export class RiderDispatchService {
  constructor(
    private readonly db: DatabaseService,
    private readonly orders: OrderRepository,
    private readonly subscriptions: SubscriptionService,
    private readonly dispatch: DispatchService,
    @Optional() private readonly calls?: OrderCallService,
  ) {}

  /** Heartbeat while on duty (every ~10 s) and the on/off switch. Returns offers and job. */
  async updatePresence(riderId: string, input: PresenceInput): Promise<DispatchState> {
    if (input.online) {
      const { eligibility } = await this.subscriptions.getSubscriptionStatus(riderId);
      if (!eligibility.canAccept) {
        throw new ForbiddenException(
          eligibility.reason === 'RIDER_NOT_APPROVED'
            ? 'Your rider account is not approved yet.'
            : 'Your weekly plan is not active. Renew to go online.',
        );
      }
      if (input.lat === undefined || input.lng === undefined) {
        throw new BadRequestException('Your location is needed to go online');
      }
    }
    await this.db.query(
      `INSERT INTO rider_presence (rider_id, is_online, latitude, longitude, heading, accuracy_m, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (rider_id) DO UPDATE
       SET is_online = EXCLUDED.is_online,
           latitude = COALESCE(EXCLUDED.latitude, rider_presence.latitude),
           longitude = COALESCE(EXCLUDED.longitude, rider_presence.longitude),
           heading = EXCLUDED.heading,
           accuracy_m = EXCLUDED.accuracy_m,
           updated_at = NOW()`,
      [
        riderId,
        input.online,
        input.lat ?? null,
        input.lng ?? null,
        input.heading ?? null,
        input.accuracy ?? null,
      ],
    );
    if (!input.online) {
      // Going offline hands any open offer back to dispatch.
      await this.db.query(
        `UPDATE order_offers SET status = 'DECLINED', responded_at = NOW()
         WHERE rider_id = $1 AND status = 'OFFERED'`,
        [riderId],
      );
      this.dispatch.kick();
    }
    return this.state(riderId);
  }

  async state(riderId: string): Promise<DispatchState> {
    const [presence, offer, job, today] = await Promise.all([
      this.db.query<{ is_online: boolean }>(
        `SELECT is_online FROM rider_presence WHERE rider_id = $1`,
        [riderId],
      ),
      this.currentOffer(riderId),
      this.orders.activeJobForRider(riderId),
      // Ghana is UTC+0 all year, so "today" is the UTC calendar day.
      this.db.query<{ n: number; cash: string }>(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(fare_pesewas), 0)::text AS cash
         FROM delivery_orders
         WHERE rider_id = $1 AND status = 'DELIVERED' AND delivered_at >= date_trunc('day', NOW())`,
        [riderId],
      ),
    ]);
    return {
      online: presence.rows[0]?.is_online ?? false,
      offer,
      job: job ? await this.toJobView(job) : null,
      today: { completed: today.rows[0]?.n ?? 0, cashPesewas: Number(today.rows[0]?.cash ?? 0) },
    };
  }

  async accept(riderId: string, offerId: string): Promise<DispatchState> {
    const { eligibility } = await this.subscriptions.getSubscriptionStatus(riderId);
    if (!eligibility.canAccept)
      throw new ForbiddenException('Your account cannot take orders right now.');

    await this.db.withTransaction(async (client) => {
      const offer = await client.query<{ order_id: string; status: string; expired: boolean }>(
        `SELECT order_id, status, expires_at < NOW() AS expired FROM order_offers
         WHERE id = $1 AND rider_id = $2 FOR UPDATE`,
        [offerId, riderId],
      );
      const o = offer.rows[0];
      if (!o) throw new NotFoundException('Offer not found');
      if (o.status !== 'OFFERED' || o.expired) {
        throw new ConflictException('This order is no longer available.');
      }
      const order = await this.orders.lockById(client, o.order_id);
      if (!order || order.status !== 'SEARCHING') {
        await client.query(
          `UPDATE order_offers SET status = 'WITHDRAWN', responded_at = NOW() WHERE id = $1`,
          [offerId],
        );
        throw new ConflictException('This order is no longer available.');
      }
      await client.query(
        `UPDATE order_offers SET status = 'ACCEPTED', responded_at = NOW() WHERE id = $1`,
        [offerId],
      );
      try {
        await client.query(
          `UPDATE delivery_orders SET rider_id = $2, status = 'ASSIGNED', assigned_at = NOW() WHERE id = $1`,
          [o.order_id, riderId],
        );
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          throw new ConflictException('Finish your current delivery first.');
        }
        throw err;
      }
    });
    return this.state(riderId);
  }

  async decline(riderId: string, offerId: string): Promise<DispatchState> {
    await this.db.query(
      `UPDATE order_offers SET status = 'DECLINED', responded_at = NOW()
       WHERE id = $1 AND rider_id = $2 AND status = 'OFFERED'`,
      [offerId, riderId],
    );
    this.dispatch.kick();
    return this.state(riderId);
  }

  async pickedUp(riderId: string, orderId: string): Promise<DispatchState> {
    const res = await this.db.query(
      `UPDATE delivery_orders SET status = 'PICKED_UP', picked_up_at = NOW()
       WHERE id = $1 AND rider_id = $2 AND status = 'ASSIGNED' RETURNING id`,
      [orderId, riderId],
    );
    if (res.rows.length === 0) throw new ConflictException('This job is not waiting for pickup.');
    return this.state(riderId);
  }

  /** Completes the delivery when the rider enters the customer's 4-digit PIN. */
  async delivered(riderId: string, orderId: string, pin: string): Promise<DispatchState> {
    const outcome = await this.db.withTransaction(async (client) => {
      const order = await this.orders.lockById(client, orderId);
      if (!order || order.riderId !== riderId) throw new NotFoundException('Job not found');
      if (order.status !== 'PICKED_UP')
        throw new ConflictException('Confirm pickup before delivering.');
      if (order.pinAttempts >= MAX_PIN_ATTEMPTS) {
        throw new HttpException(
          'Too many wrong PINs. Call the customer, or GhanaDash support, to complete this delivery.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const ok =
        /^\d{4}$/.test(pin) &&
        crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(order.deliveryPin));
      if (!ok) {
        await client.query(
          `UPDATE delivery_orders SET pin_attempts = pin_attempts + 1 WHERE id = $1`,
          [orderId],
        );
        return { ok: false, left: MAX_PIN_ATTEMPTS - order.pinAttempts - 1 };
      }
      await client.query(
        `UPDATE delivery_orders SET status = 'DELIVERED', delivered_at = NOW() WHERE id = $1`,
        [orderId],
      );
      return { ok: true, left: 0 };
    });
    if (!outcome.ok) {
      throw new BadRequestException(
        outcome.left > 0
          ? `Wrong PIN. ${outcome.left} attempt${outcome.left === 1 ? '' : 's'} left.`
          : 'Wrong PIN. No attempts left: call the customer or GhanaDash support.',
      );
    }
    return this.state(riderId);
  }

  /** Rider can't do an accepted job (before pickup): it goes back to dispatch for someone else. */
  async release(riderId: string, orderId: string): Promise<DispatchState> {
    const res = await this.db.query(
      `UPDATE delivery_orders SET status = 'SEARCHING', rider_id = NULL, assigned_at = NULL
       WHERE id = $1 AND rider_id = $2 AND status = 'ASSIGNED' RETURNING id`,
      [orderId, riderId],
    );
    if (res.rows.length === 0) {
      throw new ConflictException(
        'Only an accepted job that has not been picked up can be released.',
      );
    }
    this.dispatch.kick();
    return this.state(riderId);
  }

  private async currentOffer(riderId: string): Promise<RiderOfferView | null> {
    const res = await this.db.query<OfferRow>(
      `SELECT f.id, f.order_id, f.expires_at, f.distance_to_pickup_m,
              o.pickup_lat, o.pickup_lng, o.pickup_address, o.pickup_landmark,
              o.dropoff_lat, o.dropoff_lng, o.dropoff_address, o.dropoff_landmark,
              o.package_type, o.fragile, o.distance_m, o.duration_s, o.fare_pesewas,
              (o.package_photo_path IS NOT NULL) AS has_package_photo
       FROM order_offers f JOIN delivery_orders o ON o.id = f.order_id
       WHERE f.rider_id = $1 AND f.status = 'OFFERED' AND f.expires_at > NOW() AND o.status = 'SEARCHING'
       LIMIT 1`,
      [riderId],
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      orderId: r.order_id,
      expiresAt: new Date(r.expires_at).toISOString(),
      distanceToPickupMeters: r.distance_to_pickup_m,
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
      packageType: r.package_type,
      fragile: r.fragile,
      distanceMeters: r.distance_m,
      durationSeconds: r.duration_s,
      farePesewas: r.fare_pesewas,
      paymentMethod: 'CASH',
      hasPackagePhoto: Boolean(r.has_package_photo),
    };
  }

  private async toJobView(o: DeliveryOrder): Promise<RiderJobView> {
    return {
      id: o.id,
      code: o.code,
      status: o.status,
      pickup: o.pickup,
      dropoff: o.dropoff,
      packageType: o.packageType,
      fragile: o.fragile,
      notes: o.notes,
      distanceMeters: o.distanceMeters,
      durationSeconds: o.durationSeconds,
      farePesewas: o.farePesewas,
      paymentMethod: o.paymentMethod,
      customerName: await this.orders.customerName(o.customerId),
      assignedAt: o.assignedAt,
      pickedUpAt: o.pickedUpAt,
      hasPackagePhoto: Boolean(o.packagePhotoPath),
      messageCount: await this.orders.messageCount(o.id),
      call: this.calls?.summaryFor(o.id, 'RIDER', o.status) ?? null,
    };
  }
}
