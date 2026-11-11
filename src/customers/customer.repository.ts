import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface Customer {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string | null;
  createdAt: Date;
}

interface Row {
  id: string;
  full_name: string;
  phone_number: string;
  email: string | null;
  created_at: Date;
}

const map = (r: Row): Customer => ({
  id: r.id,
  fullName: r.full_name,
  phoneNumber: r.phone_number,
  email: r.email,
  createdAt: new Date(r.created_at),
});

@Injectable()
export class CustomerRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<Customer | null> {
    const res = await this.db.query<Row>(
      `SELECT id, full_name, phone_number, email, created_at FROM customers WHERE id = $1`,
      [id],
    );
    return res.rows[0] ? map(res.rows[0]) : null;
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const res = await this.db.query<Row>(
      `SELECT id, full_name, phone_number, email, created_at FROM customers WHERE phone_number = $1`,
      [phone],
    );
    return res.rows[0] ? map(res.rows[0]) : null;
  }

  /** Creates the profile, or updates name/phone/email when it already exists. */
  async upsert(
    id: string,
    fullName: string,
    phone: string,
    email: string | null,
  ): Promise<Customer> {
    const res = await this.db.query<Row>(
      `INSERT INTO customers (id, full_name, phone_number, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           phone_number = EXCLUDED.phone_number,
           email = COALESCE(EXCLUDED.email, customers.email)
       RETURNING id, full_name, phone_number, email, created_at`,
      [id, fullName, phone, email],
    );
    return map(res.rows[0]);
  }
}
