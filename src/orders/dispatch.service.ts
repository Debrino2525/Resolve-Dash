import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { computeSubscriptionState } from '../subscriptions/subscription-state';
import { haversineMeters } from './geo';

export const OFFER_TTL_SECONDS = 25;
export const SEARCH_TIMEOUT_MINUTES = 10;
export const PRESENCE_FRESH_SECONDS = 60;
export const DISPATCH_RADIUS_METERS = 15_000;
const TICK_MS = 3000;

interface CandidateRow {
  rider_id: string;
  latitude: number;
  longitude: number;
  has_subscription: boolean;
  trial_ends_at: Date | null;
  paid_until: Date | null;
  grace_ends_at: Date | null;
}

export interface Candidate {
  riderId: string;
  lat: number;
  lng: number;
  eligible: boolean;
}

/** Nearest eligible rider within the radius, or null. Pure for testing. */
export function pickNearest(
  pickup: { lat: number; lng: number },
  candidates: Candidate[],
  radiusMeters = DISPATCH_RADIUS_METERS,
): { riderId: string; distance: number } | null {
  let best: { riderId: string; distance: number } | null = null;
  for (const c of candidates) {
    if (!c.eligible) continue;
    const distance = haversineMeters(pickup, { lat: c.lat, lng: c.lng });
    if (distance > radiusMeters) continue;
    if (!best || distance < best.distance) best = { riderId: c.riderId, distance };
  }
  return best;
}

/**
 * Matches waiting orders to riders, one offer at a time. Runs every 3 s and whenever kicked
 * (new order, decline). The database is the source of truth; this loop holds no state, so a
 * restart simply resumes. Single backend instance assumed (one loop).
 */
@Injectable()
export class DispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private pending = false;

  constructor(private readonly db: DatabaseService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test' || process.env.DISPATCH_DISABLED === 'true') return;
    this.timer = setInterval(() => this.kick(), TICK_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Run a dispatch pass soon; coalesces overlapping requests. */
  kick(): void {
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
    this.tick()
      .catch((err) =>
        this.logger.error(
          `Dispatch pass failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      )
      .finally(() => {
        this.running = false;
        if (this.pending) {
          this.pending = false;
          this.kick();
        }
      });
  }

  async tick(): Promise<void> {
    // 1. Offers nobody answered in time.
    await this.db.query(
      `UPDATE order_offers SET status = 'EXPIRED', responded_at = NOW()
       WHERE status = 'OFFERED' AND expires_at < NOW()`,
    );
    // 2. Offers for orders that were cancelled or taken meanwhile.
    await this.db.query(
      `UPDATE order_offers f SET status = 'WITHDRAWN', responded_at = NOW()
       FROM delivery_orders o
       WHERE f.order_id = o.id AND f.status = 'OFFERED' AND o.status <> 'SEARCHING'`,
    );
    // 3. Searches that ran too long.
    await this.db.query(
      `UPDATE delivery_orders SET status = 'NO_RIDER', cancelled_by = 'SYSTEM',
              cancel_reason = 'No rider was available', cancelled_at = NOW()
       WHERE status = 'SEARCHING' AND requested_at < NOW() - make_interval(mins => $1)`,
      [SEARCH_TIMEOUT_MINUTES],
    );
    // 4. Offer every waiting order without an open offer to its nearest available rider.
    const waiting = await this.db.query<{ id: string; pickup_lat: number; pickup_lng: number }>(
      `SELECT o.id, o.pickup_lat, o.pickup_lng FROM delivery_orders o
       WHERE o.status = 'SEARCHING'
         AND NOT EXISTS (SELECT 1 FROM order_offers f WHERE f.order_id = o.id AND f.status = 'OFFERED')
       ORDER BY o.requested_at ASC LIMIT 25`,
    );
    for (const order of waiting.rows) {
      await this.offerToNearest(order.id, {
        lat: Number(order.pickup_lat),
        lng: Number(order.pickup_lng),
      });
    }
  }

  private async offerToNearest(
    orderId: string,
    pickup: { lat: number; lng: number },
  ): Promise<void> {
    const res = await this.db.query<CandidateRow>(
      `SELECT p.rider_id, p.latitude, p.longitude, (s.id IS NOT NULL) AS has_subscription,
              s.trial_ends_at, s.paid_until, s.grace_ends_at
       FROM rider_presence p
       JOIN riders r ON r.id = p.rider_id AND r.onboarding_status = 'ACTIVE'
       LEFT JOIN subscriptions s ON s.rider_id = p.rider_id
       WHERE p.is_online
         AND p.latitude IS NOT NULL
         AND p.updated_at > NOW() - make_interval(secs => $2)
         AND NOT EXISTS (SELECT 1 FROM delivery_orders o
                         WHERE o.rider_id = p.rider_id AND o.status IN ('ASSIGNED','PICKED_UP'))
         AND NOT EXISTS (SELECT 1 FROM order_offers f
                         WHERE f.rider_id = p.rider_id AND (f.status = 'OFFERED' OR f.order_id = $1))`,
      [orderId, PRESENCE_FRESH_SECONDS],
    );
    const now = new Date();
    const candidates: Candidate[] = res.rows.map((r) => ({
      riderId: r.rider_id,
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      eligible:
        r.has_subscription &&
        computeSubscriptionState(
          { trialEndsAt: r.trial_ends_at, paidUntil: r.paid_until, graceEndsAt: r.grace_ends_at },
          now,
        ).canAccept,
    }));
    const best = pickNearest(pickup, candidates);
    if (!best) return;
    try {
      await this.db.query(
        `INSERT INTO order_offers (order_id, rider_id, distance_to_pickup_m, expires_at)
         VALUES ($1, $2, $3, NOW() + make_interval(secs => $4))`,
        [orderId, best.riderId, Math.round(best.distance), OFFER_TTL_SECONDS],
      );
    } catch (err) {
      // Another pass created an offer for this order or rider first: fine, skip.
      if ((err as { code?: string }).code !== '23505') throw err;
    }
  }
}
