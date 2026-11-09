import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface DatabaseServiceOptions {
  connectionString?: string;
  pool?: Pool;
  max?: number;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(options?: DatabaseServiceOptions) {
    if (options?.pool) {
      this.pool = options.pool;
      return;
    }

    const connectionString = options?.connectionString ?? process.env.DATABASE_URL;
    if (!connectionString) {
      // In dev or unit test environments without a DB URL, warn but defer connection failure to query time
      this.logger.warn('DATABASE_URL is not set. Database operations will fail unless configured.');
    }

    this.pool = new Pool({
      connectionString,
      max: options?.max ?? 10,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }, // Supabase Supavisor requires SSL
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

  /**
   * Executes a single parameterized query directly using a pooled client.
   */
  async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: (string | number | boolean | null | undefined | Buffer | Date | object)[],
  ): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, values);
  }

  /**
   * Runs the provided work inside an explicit transaction with BEGIN/COMMIT/ROLLBACK.
   * If any error is thrown, the transaction is automatically rolled back.
   */
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
