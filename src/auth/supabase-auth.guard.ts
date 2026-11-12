import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthUser } from './auth.types';
import { getSupabaseUrl } from './supabase-config';

interface JwkKey {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
  [key: string]: unknown;
}

interface JwksResponse {
  keys: JwkKey[];
}

interface JwtHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface JwtPayload {
  sub: string;
  exp: number;
  iat?: number;
  email?: string;
  phone?: string;
  role?: string;
  app_metadata?: {
    role?: string;
    [key: string]: unknown;
  };
  user_metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private jwksCache: JwkKey[] | null = null;
  private jwksLastFetched = 0;
  private readonly jwksTtlMs = 60 * 60 * 1000; // 1 hour

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();

    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('Empty bearer token');
    }

    const user = await this.verifyToken(token);
    request.user = user;
    return true;
  }

  async verifyToken(token: string): Promise<AuthUser> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Malformed JWT: must contain three parts');
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    let header: JwtHeader;
    let payload: JwtPayload;

    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as JwtHeader;
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid JWT encoding');
    }

    // Check expiration
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < nowSec) {
      throw new UnauthorizedException('JWT has expired');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('JWT missing sub claim');
    }

    // Signature verification
    const dataToVerify = `${headerB64}.${payloadB64}`;
    const signatureBuffer = Buffer.from(signatureB64, 'base64url');

    let isSignatureValid = false;

    if (header.alg === 'HS256') {
      const secret = process.env.SUPABASE_JWT_SECRET;
      if (!secret) {
        throw new UnauthorizedException('JWT secret is not configured for HS256 tokens');
      }
      const expectedSig = crypto.createHmac('sha256', secret).update(dataToVerify).digest();

      if (expectedSig.length === signatureBuffer.length) {
        isSignatureValid = crypto.timingSafeEqual(expectedSig, signatureBuffer);
      }
    } else if (header.alg === 'RS256' || header.alg === 'ES256') {
      const jwk = await this.resolveJwkKey(header.kid);
      if (!jwk) {
        throw new UnauthorizedException(`Public key for kid '${header.kid}' not found`);
      }

      try {
        const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
        // JWS (RFC 7518 §3.4) encodes ES256 signatures as raw 64-byte r||s ("IEEE P1363"),
        // whereas Node defaults to DER for ECDSA. Without dsaEncoding every real ES256 token
        // (Supabase's default signing keys) fails verification.
        isSignatureValid = crypto.verify(
          'sha256',
          Buffer.from(dataToVerify),
          header.alg === 'ES256' ? { key: publicKey, dsaEncoding: 'ieee-p1363' } : publicKey,
          signatureBuffer,
        );
      } catch (err) {
        this.logger.warn(
          `Public key verification failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        isSignatureValid = false;
      }
    } else {
      throw new UnauthorizedException(`Unsupported JWT algorithm: ${header.alg}`);
    }

    if (!isSignatureValid) {
      throw new UnauthorizedException('Invalid JWT signature');
    }

    return {
      id: payload.sub,
      // Only the top-level claim: Supabase sets it after verifying the number. user_metadata is
      // editable by the user, so a phone there proves nothing.
      phoneNumber: payload.phone || undefined,
      email: payload.email,
      role: payload.app_metadata?.role ?? payload.role,
      appMetadata: payload.app_metadata,
    };
  }

  private async resolveJwkKey(kid?: string): Promise<JwkKey | undefined> {
    const keys = await this.getJwks();
    if (!kid && keys.length === 1) return keys[0];
    return keys.find((k) => k.kid === kid);
  }

  private async getJwks(): Promise<JwkKey[]> {
    const now = Date.now();
    if (this.jwksCache && now - this.jwksLastFetched < this.jwksTtlMs) {
      return this.jwksCache;
    }

    const jwksUrl = `${getSupabaseUrl()}/auth/v1/.well-known/jwks.json`;

    try {
      const res = await fetch(jwksUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as JwksResponse;
      this.jwksCache = data.keys || [];
      this.jwksLastFetched = now;
      return this.jwksCache;
    } catch (err) {
      this.logger.error(
        `Failed to fetch JWKS from ${jwksUrl}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.jwksCache || [];
    }
  }
}
