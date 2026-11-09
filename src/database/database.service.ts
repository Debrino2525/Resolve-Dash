import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      this.logger.warn('DATABASE_URL is not set. Database operations will fail unless configured.');
    }

    this.pool = new Pool({
      connectionString,
      max: 10,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    });

    this.pool.on('error', (err) => {
      this.logger.error(
        `Unexpected idle client error in PostgreSQL pool: ${err.message}`,
        err.stack,
      );
    });
  }

  getPool(): Pool {
    return this.pool;
  }

  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: (string | number | boolean | null | undefined | Buffer | Date | object)[],
  ): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, values);
  }

  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        this.logger.error(
          `Failed to rollback transaction: ${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}`,
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
