import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { AssignedRider, DeliveryOrder, OrderStatus, OrderStop, PackageType } from './order.types';

interface OrderRow {
  id: string;
  code: string;
  customer_id: string;
  rider_id: string | null;
  status: OrderStatus;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string;
  pickup_landmark: string | null;
  pickup_gps_code: string | null;
  pickup_contact_name: string;
  pickup_contact_phone: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_address: string;
  dropoff_landmark: string | null;
  dropoff_gps_code: string | null;
  receiver_name: string;
  receiver_phone: string;
  package_type: PackageType;
  fragile: boolean;
  notes: string | null;
  distance_m: number;
  duration_s: number;
  base_fare_pesewas: number;
  distance_fare_pesewas: number;
  fare_pesewas: number;
  payment_method: 'CASH';
  delivery_pin: string;
  pin_attempts: number;
  rating: number | null;
  rating_tags: string[] | null;
  rating_comment: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  requested_at: Date;
  assigned_at: Date | null;
  picked_up_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
}

const iso = (d: Date | null): string | null => (d ? new Date(d).toISOString() : null);

export function mapOrder(r: OrderRow): DeliveryOrder {
  return {
    id: r.id,
    code: r.code,
    customerId: r.customer_id,
    riderId: r.rider_id,
    status: r.status,
    pickup: {
      lat: Number(r.pickup_lat),
      lng: Number(r.pickup_lng),
      address: r.pickup_address,
      landmark: r.pickup_landmark,
      gpsCode: r.pickup_gps_code,
      contactName: r.pickup_contact_name,
      contactPhone: r.pickup_contact_phone,
    },
    dropoff: {
      lat: Number(r.dropoff_lat),
      lng: Number(r.dropoff_lng),
      address: r.dropoff_address,
      landmark: r.dropoff_landmark,
      gpsCode: r.dropoff_gps_code,
      contactName: r.receiver_name,
      contactPhone: r.receiver_phone,
    },
    packageType: r.package_type,
    fragile: r.fragile,
    notes: r.notes,
    distanceMeters: r.distance_m,
    durationSeconds: r.duration_s,
    baseFarePesewas: r.base_fare_pesewas,
    distanceFarePesewas: r.distance_fare_pesewas,
    farePesewas: r.fare_pesewas,
    paymentMethod: r.payment_method,
    deliveryPin: r.delivery_pin,
    pinAttempts: r.pin_attempts,
    rating: r.rating,
    ratingTags: r.rating_tags,
    ratingComment: r.rating_comment,
    cancelReason: r.cancel_reason,
    cancelledBy: r.cancelled_by,
    requestedAt: new Date(r.requested_at).toISOString(),
    assignedAt: iso(r.assigned_at),
    pickedUpAt: iso(r.picked_up_at),
    deliveredAt: iso(r.delivered_at),
    cancelledAt: iso(r.cancelled_at),
  };
}

export interface NewOrder {
  code: string;
  customerId: string;
  pickup: OrderStop;
  dropoff: OrderStop;
  packageType: PackageType;
  fragile: boolean;
  notes: string | null;
  distanceMeters: number;
  durationSeconds: number;
  baseFarePesewas: number;
  distanceFarePesewas: number;
  farePesewas: number;
  deliveryPin: string;
}

@Injectable()
export class OrderRepository {
  constructor(private readonly db: DatabaseService) {}

  async insert(o: NewOrder): Promise<DeliveryOrder> {
    const res = await this.db.query<OrderRow>(
      `INSERT INTO delivery_orders (
         code, customer_id,
         pickup_lat, pickup_lng, pickup_address, pickup_landmark, pickup_gps_code, pickup_contact_name, pickup_contact_phone,
         dropoff_lat, dropoff_lng, dropoff_address, dropoff_landmark, dropoff_gps_code, receiver_name, receiver_phone,
         package_type, fragile, notes, distance_m, duration_s,
         base_fare_pesewas, distance_fare_pesewas, fare_pesewas, delivery_pin
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING *`,
      [
        o.code,
        o.customerId,
        o.pickup.lat,
        o.pickup.lng,
        o.pickup.address,
        o.pickup.landmark,
        o.pickup.gpsCode,
        o.pickup.contactName,
        o.pickup.contactPhone,
        o.dropoff.lat,
        o.dropoff.lng,
        o.dropoff.address,
        o.dropoff.landmark,
        o.dropoff.gpsCode,
        o.dropoff.contactName,
        o.dropoff.contactPhone,
        o.packageType,
        o.fragile,
        o.notes,
        o.distanceMeters,
        o.durationSeconds,
        o.baseFarePesewas,
        o.distanceFarePesewas,
        o.farePesewas,
        o.deliveryPin,
      ],
    );
    return mapOrder(res.rows[0]);
  }

  async findById(id: string): Promise<DeliveryOrder | null> {
    const res = await this.db.query<OrderRow>(`SELECT * FROM delivery_orders WHERE id = $1`, [id]);
    return res.rows[0] ? mapOrder(res.rows[0]) : null;
  }

  async lockById(client: PoolClient, id: string): Promise<DeliveryOrder | null> {
    const res = await client.query<OrderRow>(
      `SELECT * FROM delivery_orders WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return res.rows[0] ? mapOrder(res.rows[0]) : null;
  }

  async listForCustomer(customerId: string, limit = 50): Promise<DeliveryOrder[]> {
    const res = await this.db.query<OrderRow>(
      `SELECT * FROM delivery_orders WHERE customer_id = $1 ORDER BY requested_at DESC LIMIT $2`,
      [customerId, limit],
    );
    return res.rows.map(mapOrder);
  }

  async countActiveForCustomer(customerId: string): Promise<number> {
    const res = await this.db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM delivery_orders
       WHERE customer_id = $1 AND status IN ('SEARCHING','ASSIGNED','PICKED_UP')`,
      [customerId],
    );
    return res.rows[0]?.n ?? 0;
  }

  async activeJobForRider(riderId: string): Promise<DeliveryOrder | null> {
    const res = await this.db.query<OrderRow>(
      `SELECT * FROM delivery_orders WHERE rider_id = $1 AND status IN ('ASSIGNED','PICKED_UP') LIMIT 1`,
      [riderId],
    );
    return res.rows[0] ? mapOrder(res.rows[0]) : null;
  }

  async customerName(customerId: string): Promise<string> {
    const res = await this.db.query<{ full_name: string }>(
      `SELECT full_name FROM customers WHERE id = $1`,
      [customerId],
    );
    return res.rows[0]?.full_name ?? 'Customer';
  }

  /** Rider card for the customer: identity, plate, rating, trips and live position. */
  async assignedRider(riderId: string): Promise<AssignedRider | null> {
    const res = await this.db.query<{
      id: string;
      full_name: string;
      phone_number: string;
      plate: string | null;
      rating: string | null;
      trips: number;
      latitude: number | null;
      longitude: number | null;
      heading: number | null;
      updated_at: Date | null;
    }>(
      `SELECT r.id, r.full_name, r.phone_number,
              (SELECT d.document_number FROM rider_documents d
                 WHERE d.rider_id = r.id AND d.doc_type = 'ROADWORTHY' AND d.status = 'APPROVED') AS plate,
              (SELECT ROUND(AVG(o.rating)::numeric, 1)::text FROM delivery_orders o
                 WHERE o.rider_id = r.id AND o.rating IS NOT NULL) AS rating,
              (SELECT COUNT(*)::int FROM delivery_orders o
                 WHERE o.rider_id = r.id AND o.status = 'DELIVERED') AS trips,
              p.latitude, p.longitude, p.heading, p.updated_at
       FROM riders r LEFT JOIN rider_presence p ON p.rider_id = r.id
       WHERE r.id = $1`,
      [riderId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      fullName: row.full_name,
      phoneNumber: row.phone_number,
      plate: row.plate,
      rating: row.rating ? Number(row.rating) : null,
      completedTrips: row.trips,
      location:
        row.latitude !== null && row.longitude !== null && row.updated_at
          ? {
              lat: Number(row.latitude),
              lng: Number(row.longitude),
              heading: row.heading !== null ? Number(row.heading) : null,
              updatedAt: new Date(row.updated_at).toISOString(),
            }
          : null,
    };
  }
}
