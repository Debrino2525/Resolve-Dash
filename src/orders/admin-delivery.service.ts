import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DeliveryNotifier } from './delivery-notifier';
import { DispatchService } from './dispatch.service';
import { OrderRepository } from './order.repository';
import { DeliveryOrder, ExtraStop } from './order.types';

/**
 * GhanaDash support closing a delivery that can't finish normally: the rider is locked out
 * after too many wrong PINs, the customer has no PIN, the rider vanished after pickup... Until it
 * is closed the rider can't take another job (one active job per rider).
 *
 * Every close records the admin and their reason on the order.
 */
@Injectable()
export class AdminDeliveryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly orders: OrderRepository,
    private readonly dispatch: DispatchService,
    @Optional() private readonly notify?: DeliveryNotifier,
  ) {}

  /** The package was handed over (support confirmed it with the customer). Picked-up jobs only. */
  async markDelivered(orderId: string, adminId: string, note: string): Promise<void> {
    const order = await this.db.withTransaction(async (client) => {
      const o = await this.orders.lockById(client, orderId);
      if (!o) throw new NotFoundException('Delivery not found');
      if (o.status !== 'PICKED_UP') {
        throw new ConflictException(
          o.status === 'ASSIGNED'
            ? 'The rider has not picked this package up yet. Cancel it instead.'
            : 'Only a delivery in progress (picked up) can be marked delivered.',
        );
      }
      const now = new Date().toISOString();
      const stops: ExtraStop[] = o.extraStops.map((s) =>
        s.status === 'PENDING' ? { ...s, status: 'DELIVERED', doneAt: now } : s,
      );
      await client.query(
        `UPDATE delivery_orders
         SET status = 'DELIVERED', delivered_at = NOW(), extra_stops = $2::jsonb,
             admin_closed_by = $3, admin_close_note = $4
         WHERE id = $1`,
        [orderId, JSON.stringify(stops), adminId, note],
      );
      return o;
    });
    this.notify?.closedBySupport(order, 'DELIVERED');
  }

  /** Cancels a delivery that hasn't been delivered yet, at any stage. */
  async cancel(orderId: string, adminId: string, reason: string): Promise<void> {
    const order: DeliveryOrder = await this.db.withTransaction(async (client) => {
      const o = await this.orders.lockById(client, orderId);
      if (!o) throw new NotFoundException('Delivery not found');
      if (!['SEARCHING', 'ASSIGNED', 'PICKED_UP'].includes(o.status)) {
        throw new ConflictException('This delivery has already ended.');
      }
      await client.query(
        `UPDATE delivery_orders
         SET status = 'CANCELLED', cancelled_by = 'ADMIN', cancel_reason = $2, cancelled_at = NOW(),
             admin_closed_by = $3, admin_close_note = $2
         WHERE id = $1`,
        [orderId, reason, adminId],
      );
      await client.query(
        `UPDATE order_offers SET status = 'WITHDRAWN', responded_at = NOW()
         WHERE order_id = $1 AND status = 'OFFERED'`,
        [orderId],
      );
      return o;
    });
    this.notify?.closedBySupport(order, 'CANCELLED');
    this.dispatch.kick();
  }
}
