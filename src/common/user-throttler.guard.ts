import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';

/** Verified tokens kept so each request's signature is checked only once per token. */
const MAX_CACHED = 5000;

/**
 * Rate limits per signed-in account instead of per IP address.
 *
 * Ghana's mobile networks put thousands of phones behind a few shared (CGNAT) addresses, so a
 * per-IP budget lets a handful of busy riders block everyone else on the same network. A request
 * with a valid Supabase token counts against that user; anything else (no token, bad token, the
 * admin login, webhooks) still counts per IP.
 *
 * Only a token that passes signature checks earns a per-user bucket: a forged token naming
 * someone else's id can't use up their budget.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  private readonly verifier = new SupabaseAuthGuard();
  private readonly verified = new Map<string, { sub: string; exp: number }>();

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req.headers as Record<string, unknown> | undefined;
    const sub = await this.userId(headers?.authorization);
    return sub ? `user:${sub}` : `ip:${await super.getTracker(req)}`;
  }

  private async userId(header: unknown): Promise<string | null> {
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    const token = header.slice(7).trim();
    if (!token) return null;
    const now = Math.floor(Date.now() / 1000);
    const hit = this.verified.get(token);
    if (hit) {
      if (hit.exp > now) return hit.sub;
      this.verified.delete(token);
    }
    try {
      const user = await this.verifier.verifyToken(token);
      const exp = readExp(token) ?? now + 60;
      if (this.verified.size >= MAX_CACHED) this.prune(now);
      this.verified.set(token, { sub: user.id, exp });
      return user.id;
    } catch {
      return null;
    }
  }

  private prune(now: number): void {
    for (const [k, v] of this.verified) if (v.exp <= now) this.verified.delete(k);
    // Still full of live tokens: drop the oldest half (Map keeps insertion order).
    if (this.verified.size >= MAX_CACHED) {
      let n = Math.floor(MAX_CACHED / 2);
      for (const k of this.verified.keys()) {
        if (n-- <= 0) break;
        this.verified.delete(k);
      }
    }
  }
}

function readExp(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}
