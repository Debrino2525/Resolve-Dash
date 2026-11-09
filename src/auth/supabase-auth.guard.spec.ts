import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { SupabaseAuthGuard } from './supabase-auth.guard';

describe('SupabaseAuthGuard', () => {
  let guard: SupabaseAuthGuard;
  const TEST_JWT_SECRET = 'super-secret-jwt-key-for-testing-purposes-12345';

  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;
    guard = new SupabaseAuthGuard();
  });

  function createTestJwt(
    payload: Record<string, unknown>,
    secret: string = TEST_JWT_SECRET,
    header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
  ): string {
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    return `${headerB64}.${payloadB64}.${signature}`;
  }

  function createMockContext(authHeader?: string): {
    context: ExecutionContext;
    request: { headers: Record<string, string | undefined>; user?: unknown };
  } {
    const request = {
      headers: {
        authorization: authHeader,
      },
      user: undefined,
    };

    const context = {
      switchToHttp: (): { getRequest: () => typeof request } => ({
        getRequest: (): typeof request => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  it('throws UnauthorizedException if Authorization header is missing', async () => {
    const { context } = createMockContext(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException if Authorization header is not Bearer', async () => {
    const { context } = createMockContext('Basic 12345');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException if JWT is expired', async () => {
    const expiredToken = createTestJwt({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) - 60, // expired 1 min ago
    });

    const { context } = createMockContext(`Bearer ${expiredToken}`);
    await expect(guard.canActivate(context)).rejects.toThrow('JWT has expired');
  });

  it('throws UnauthorizedException if JWT has invalid signature', async () => {
    const forgedToken = createTestJwt(
      { sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 },
      'wrong-secret',
    );

    const { context } = createMockContext(`Bearer ${forgedToken}`);
    await expect(guard.canActivate(context)).rejects.toThrow('Invalid JWT signature');
  });

  it('authenticates valid HS256 JWT and attaches user to request', async () => {
    const validToken = createTestJwt({
      sub: 'user-1234-uuid',
      phone: '+233201234567',
      email: 'rider@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      app_metadata: { role: 'rider' },
    });

    const { context, request } = createMockContext(`Bearer ${validToken}`);
    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(request.user).toEqual({
      id: 'user-1234-uuid',
      phoneNumber: '+233201234567',
      email: 'rider@example.com',
      role: 'rider',
      appMetadata: { role: 'rider' },
    });
  });
});
