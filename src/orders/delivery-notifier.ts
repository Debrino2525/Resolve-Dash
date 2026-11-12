import { Injectable, Optional } from '@nestjs/common';
import { PushService } from '../push/push.service';
import { OrderRepository } from './order.repository';
import { DeliveryOrder } from './order.types';

const cedis = (pesewas: number): string => `GH₵${(pesewas / 100).toFixed(2)}`;
const km = (m: number): string => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const short = (s: string, n = 60): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The push notifications a delivery sends, worded in one place. Every method is fire-and-forget
 * and silently does nothing when push isn't wired (tests) or a person has no registered phone.
 */
@Injectable()
export class DeliveryNotifier {
  constructor(
    private readonly orders: OrderRepository,
    @Optional() private readonly push?: PushService,
  ) {}

  // ---------- rider ----------

  /** A new offer: rings on the rider's "offers" channel; useless after the offer expires. */
  offer(
    riderId: string,
    o: { orderId: string; pickupAddress: string; toPickupMeters: number; farePesewas: number },
    ttlSeconds: number,
  ): void {
    this.push?.notify(riderId, 'rider', {
      title: `New delivery · ${cedis(o.farePesewas)}`,
      body: `Pickup ${km(o.toPickupMeters)} away: ${short(o.pickupAddress)}. Open to accept.`,
      channel: 'offers',
      sound: 'new_order.wav',
      ttl: ttlSeconds,
      data: { type: 'offer', orderId: o.orderId },
    });
  }

  /** The rider has gone quiet while on duty or on a job. */
  stale(riderIds: string[], onJob: Set<string>): void {
    for (const id of riderIds) {
      this.push?.notify(id, 'rider', {
        title: onJob.has(id) ? 'Your customer can’t see you moving' : 'You’re not getting orders',
        body: onJob.has(id)
          ? 'GhanaDash stopped sharing your location. Open the app to keep your delivery on track.'
          : 'GhanaDash lost your location, so new orders go to other riders. Open the app to stay online.',
        channel: 'alerts',
        data: { type: 'stale' },
      });
    }
  }

  customerCancelled(order: DeliveryOrder): void {
    this.push?.notify(order.riderId, 'rider', {
      title: 'Delivery cancelled',
      body: `The customer cancelled ${order.code}. You can take new orders.`,
      channel: 'alerts',
      data: { type: 'order', orderId: order.id },
    });
  }

  // ---------- customer ----------

  accepted(orderId: string): void {
    void this.withOrder(orderId, async (o) => {
      const rider = o.riderId ? await this.orders.assignedRider(o.riderId) : null;
      const name = rider?.fullName?.split(' ')[0];
      this.toCustomer(o, {
        title: 'Rider on the way',
        body: `${name ?? 'A rider'} accepted ${o.code} and is heading to the pickup.`,
      });
    });
  }

  pickedUp(orderId: string): void {
    void this.withOrder(orderId, (o) =>
      this.toCustomer(o, {
        title: 'Package picked up',
        body:
          o.extraStops.length > 0
            ? `${o.code} is on its way to ${o.extraStops.length + 1} drop-offs.`
            : `${o.code} is on its way to ${short(o.dropoff.address, 50)}.`,
      }),
    );
  }

  stopDone(orderId: string, index: number): void {
    void this.withOrder(orderId, (o) => {
      const s = o.extraStops[index];
      if (!s) return;
      const n = index + 1;
      this.toCustomer(o, {
        title: s.status === 'FAILED' ? `Drop-off ${n} not delivered` : `Drop-off ${n} delivered`,
        body:
          s.status === 'FAILED'
            ? `${s.contactName}: ${s.failReason ?? 'the rider could not hand over'}. The rider is carrying on.`
            : `${s.contactName} received their package. The rider is heading to the next drop-off.`,
      });
    });
  }

  delivered(orderId: string): void {
    void this.withOrder(orderId, (o) =>
      this.toCustomer(o, {
        title: 'Delivered',
        body: `${o.code} was delivered. Tap to rate your rider.`,
      }),
    );
  }

  released(orderId: string): void {
    void this.withOrder(orderId, (o) =>
      this.toCustomer(o, {
        title: 'Finding you another rider',
        body: `Your rider couldn’t make it to the pickup for ${o.code}. We’re finding someone else.`,
      }),
    );
  }

  noRider(orders: { id: string; customerId: string; code: string }[]): void {
    for (const o of orders) {
      this.push?.notify(o.customerId, 'customer', {
        title: 'No rider available',
        body: `No rider took ${o.code} in time. You weren’t charged; please try again shortly.`,
        channel: 'delivery',
        data: { type: 'order', orderId: o.id },
      });
    }
  }

  // ---------- both ----------

  /** Rings on the other person's phone (the call itself still joins in the app). */
  incomingCall(order: DeliveryOrder, from: 'CUSTOMER' | 'RIDER'): void {
    const to = from === 'CUSTOMER' ? order.riderId : order.customerId;
    this.push?.notify(to, from === 'CUSTOMER' ? 'rider' : 'customer', {
      title: from === 'CUSTOMER' ? 'Customer is calling' : 'Your rider is calling',
      body: `About delivery ${order.code}. Open GhanaDash to answer.`,
      channel: 'calls',
      ttl: 45,
      data: { type: 'call', orderId: order.id },
    });
  }

  chatMessageById(orderId: string, from: 'CUSTOMER' | 'RIDER', text: string | null): void {
    void this.withOrder(orderId, (o) => this.chatMessage(o, from, text));
  }

  chatMessage(order: DeliveryOrder, from: 'CUSTOMER' | 'RIDER', text: string | null): void {
    const to = from === 'CUSTOMER' ? order.riderId : order.customerId;
    this.push?.notify(to, from === 'CUSTOMER' ? 'rider' : 'customer', {
      title:
        from === 'CUSTOMER'
          ? `Message from the customer · ${order.code}`
          : 'Message from your rider',
      body: text ? short(text, 120) : 'Sent a photo',
      channel: 'chat',
      data: { type: 'chat', orderId: order.id },
    });
  }

  // ---------- helpers ----------

  private toCustomer(o: DeliveryOrder, m: { title: string; body: string }): void {
    this.push?.notify(o.customerId, 'customer', {
      ...m,
      channel: 'delivery',
      data: { type: 'order', orderId: o.id },
    });
  }

  private async withOrder(
    orderId: string,
    fn: (o: DeliveryOrder) => void | Promise<void>,
  ): Promise<void> {
    if (!this.push) return;
    try {
      const o = await this.orders.findById(orderId);
      if (o) await fn(o);
    } catch {
      // Best-effort: a notification never fails the action that caused it.
    }
  }
}
