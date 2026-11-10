import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { isAdmin } from '../auth/admin.guard';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { getSupabaseUrl } from '../auth/supabase-config';

export interface AdminSession {
  accessToken: string;
  expiresAt: number; // unix seconds
  email: string | null;
}

interface SupabaseTokenResponse {
  access_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: { email?: string };
}

/**
 * Signs an admin in with Supabase email + password on the server side.
 *
 * The admin page runs under Helmet's default CSP (connect-src 'self'), so it cannot call
 * Supabase directly; it posts credentials here instead. The returned token is only handed
 * back if it verifies and carries app_metadata.role = 'admin'.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(private readonly authGuard: SupabaseAuthGuard) {}

  async login(email: string, password: string): Promise<AdminSession> {
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!anonKey) {
      throw new ServiceUnavailableException('SUPABASE_ANON_KEY is not configured on the server');
    }

    let res: Response;
    try {
      res = await fetch(`${getSupabaseUrl()}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      this.logger.error(
        `Supabase sign-in request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException('Authentication service unreachable');
    }

    if (!res.ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const body = (await res.json()) as SupabaseTokenResponse;
    if (!body.access_token) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.authGuard.verifyToken(body.access_token);
    if (!isAdmin(user)) {
      this.logger.warn(`Non-admin user ${user.id} attempted admin portal sign-in`);
      throw new ForbiddenException('This account does not have admin access');
    }

    const expiresAt = body.expires_at ?? Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600);

    return { accessToken: body.access_token, expiresAt, email: user.email ?? null };
  }
}
