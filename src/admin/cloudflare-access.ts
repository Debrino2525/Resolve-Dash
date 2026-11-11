import * as crypto from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * Server-side check that an admin-host request really passed Cloudflare Access.
 *
 * Cloudflare Access sits in front of the admin hostname and adds a signed JWT to every request it
 * lets through (header `Cf-Access-Jwt-Assertion`). Checking it here means the portal stays locked
 * even if the Access app is deleted or the DNS record is switched back to "DNS only" by mistake:
 * without a valid pass from *our* Access app, the admin host answers 403.
 *
 * Configure with CF_ACCESS_TEAM_DOMAIN (e.g. myteam.cloudflareaccess.com) and CF_ACCESS_AUD
 * (the application's Audience tag). Keys come from https://<team>/cdn-cgi/access/certs.
 */

interface AccessJwk {
  kid: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

export interface AccessIdentity {
  email: string | null;
  sub: string;
}

const KEYS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SEC = 60;

export class CloudflareAccessVerifier {
  private readonly logger = new Logger(CloudflareAccessVerifier.name);
  private readonly issuer: string;
  private keys: AccessJwk[] = [];
  private keysFetchedAt = 0;
  /** Replaceable in tests. */
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init);
  now: () => number = () => Date.now();

  constructor(
    teamDomain: string,
    private readonly audience: string,
  ) {
    const host = teamDomain
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')
      .toLowerCase();
    this.issuer = `https://${host}`;
  }

  /** Returns the signed-in identity, or null when the token is missing or not valid for our app. */
  async verify(token: string | undefined): Promise<AccessIdentity | null> {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;

    let header: { alg?: string; kid?: string };
    let payload: {
      aud?: string | string[];
      iss?: string;
      exp?: number;
      nbf?: number;
      email?: string;
      sub?: string;
    };
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as typeof header;
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as typeof payload;
    } catch {
      return null;
    }
    if (header.alg !== 'RS256' || !header.kid) return null;

    const nowSec = Math.floor(this.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_SEC < nowSec) return null;
    if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_SEC > nowSec) return null;
    if (payload.iss !== this.issuer) return null;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(this.audience)) return null;

    const jwk = await this.keyFor(header.kid);
    if (!jwk) return null;
    try {
      const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      const ok = crypto.verify(
        'sha256',
        Buffer.from(`${headerB64}.${payloadB64}`),
        key,
        Buffer.from(sigB64, 'base64url'),
      );
      if (!ok) return null;
    } catch {
      return null;
    }
    return { email: payload.email ?? null, sub: payload.sub ?? '' };
  }

  private async keyFor(kid: string): Promise<AccessJwk | undefined> {
    const fresh = this.now() - this.keysFetchedAt < KEYS_TTL_MS;
    let key = fresh ? this.keys.find((k) => k.kid === kid) : undefined;
    // Unknown kid: Cloudflare may have rotated keys, so refetch (at most once a minute).
    if (!key && this.now() - this.keysFetchedAt > (fresh ? 60_000 : 0)) {
      await this.refreshKeys();
      key = this.keys.find((k) => k.kid === kid);
    }
    return key;
  }

  private async refreshKeys(): Promise<void> {
    const url = `${this.issuer}/cdn-cgi/access/certs`;
    try {
      const res = await this.fetchImpl(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { keys?: AccessJwk[] };
      this.keys = (data.keys ?? []).filter((k) => k.kty === 'RSA');
      this.keysFetchedAt = this.now();
    } catch (err) {
      // Keep any keys we already had; without keys every request is refused (fail closed).
      this.logger.error(
        `Could not load Cloudflare Access keys from ${url}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** Built from env, or null when not configured. */
export function cloudflareAccessFromEnv(
  env: Record<string, string | undefined> = process.env,
): CloudflareAccessVerifier | null {
  const team = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const aud = env.CF_ACCESS_AUD?.trim();
  if (!team || !aud) return null;
  return new CloudflareAccessVerifier(team, aud);
}
