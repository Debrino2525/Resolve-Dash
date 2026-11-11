import * as crypto from 'crypto';

/**
 * Small HMAC-signed tokens (base64url(json).base64url(sig)) for short-lived server-issued facts the
 * client must hand back unchanged, e.g. a price quote. Not encrypted: never put secrets in them.
 */
export class SignedTokens {
  private readonly secret: Buffer;

  constructor(envName: string) {
    const configured = process.env[envName]?.trim();
    if (configured) {
      this.secret = Buffer.from(configured, 'utf8');
    } else {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`${envName} must be set in production`);
      }
      // Development: per-process secret. Tokens stop validating after a restart, which is harmless.
      this.secret = crypto.randomBytes(32);
    }
  }

  sign(payload: object): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.mac(body)}`;
  }

  /** Returns the payload if the signature is valid, otherwise null. Caller checks expiry/claims. */
  verify<T>(token: string | undefined): T | null {
    if (!token) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = Buffer.from(this.mac(body), 'base64url');
    const actual = Buffer.from(sig, 'base64url');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    } catch {
      return null;
    }
  }

  private mac(body: string): string {
    return crypto.createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
