import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { throttleTtlMs } from '../common/throttle.config';
import { PUSH_TOKEN_RE, PushService } from './push.service';

const tokenSchema = z.string().max(255).regex(PUSH_TOKEN_RE, 'Not an Expo push token');
const registerSchema = z.object({
  token: tokenSchema,
  app: z.enum(['customer', 'rider']),
  platform: z.enum(['ios', 'android']),
});
const unregisterSchema = z.object({ token: tokenSchema });

/** Apps register their Expo push token after sign-in and remove it on sign-out. */
@Controller('push/token')
@UseGuards(SupabaseAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: throttleTtlMs() } })
  async register(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<void> {
    const r = registerSchema.safeParse(body ?? {});
    if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? 'Invalid token');
    await this.push.register(user.id, r.data.app, r.data.platform, r.data.token);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async unregister(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<void> {
    const r = unregisterSchema.safeParse(body ?? {});
    if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? 'Invalid token');
    await this.push.unregister(user.id, r.data.token);
  }
}
