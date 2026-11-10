import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from './auth.types';
import { SupabaseAuthGuard } from './supabase-auth.guard';

export const ADMIN_ROLE = 'admin';

/**
 * True only when the user's server-controlled app_metadata.role is 'admin'.
 * user_metadata and the top-level JWT `role` claim are deliberately ignored:
 * riders can edit user_metadata themselves, and `role` is always 'authenticated'.
 */
export function isAdmin(user: AuthUser | undefined): boolean {
  return user?.appMetadata?.role === ADMIN_ROLE;
}

/**
 * Verifies the Supabase JWT (via SupabaseAuthGuard) and then requires the admin role.
 * Unauthenticated → 401, authenticated non-admin → 403.
 */
@Injectable()
export class AdminGuard extends SupabaseAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!isAdmin(request.user)) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
