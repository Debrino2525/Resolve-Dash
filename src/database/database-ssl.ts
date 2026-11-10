import * as fs from 'fs';
import { ConnectionOptions } from 'tls';

export type DatabaseSslConfig = false | ConnectionOptions;

export interface DatabaseSslResult {
  readonly ssl: DatabaseSslConfig;
  /** Set when the connection is encrypted but the server certificate is NOT verified. */
  readonly warning?: string;
}

/**
 * Builds the `pg` TLS options from the environment.
 *
 * - DATABASE_SSL=false                        → plain TCP (local Postgres only)
 * - DATABASE_SSL_CA=<PEM text | file path>    → TLS with certificate verification (recommended;
 *                                               Supabase: Dashboard → Database → SSL → Download)
 * - DATABASE_SSL_REJECT_UNAUTHORIZED=false    → explicit opt-out: encrypted but unverified
 * - none of the above                         → unverified in development (with a warning),
 *                                               refuse to start when NODE_ENV=production
 *
 * Unverified TLS lets anyone on the network path impersonate the database (MITM), so it is
 * never the silent default in production.
 */
export function buildDatabaseSslConfig(env: NodeJS.ProcessEnv = process.env): DatabaseSslResult {
  if (env.DATABASE_SSL === 'false') {
    return { ssl: false };
  }

  const caSetting = env.DATABASE_SSL_CA?.trim();
  if (caSetting) {
    const ca = caSetting.startsWith('-----BEGIN')
      ? caSetting.replace(/\\n/g, '\n')
      : readCaFile(caSetting);
    return { ssl: { ca, rejectUnauthorized: true } };
  }

  if (env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') {
    return {
      ssl: { rejectUnauthorized: false },
      warning:
        'DATABASE_SSL_REJECT_UNAUTHORIZED=false: database TLS certificate is NOT verified (MITM risk).',
    };
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Database TLS is not verifiable: set DATABASE_SSL_CA to the server CA certificate (PEM text or file path). ' +
        'To knowingly accept an unverified connection, set DATABASE_SSL_REJECT_UNAUTHORIZED=false.',
    );
  }

  return {
    ssl: { rejectUnauthorized: false },
    warning:
      'DATABASE_SSL_CA is not set: database TLS certificate is NOT verified. This is refused when NODE_ENV=production.',
  };
}

function readCaFile(path: string): string {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(
      `DATABASE_SSL_CA points to a file that cannot be read (${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Reads DB_POOL_MAX (positive integer), defaulting to 10. */
export function readPoolMax(raw = process.env.DB_POOL_MAX): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 10;
}
