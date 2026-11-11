import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { throttleTtlMs } from '../common/throttle.config';
import { CallJoin, CallSummary, OrderCallService } from './order-call.service';

/**
 * In-app calls on a delivery (customer ↔ assigned rider). Ringing state reaches the other side
 * through the order / job views the apps already poll (`call`).
 */
@Controller('orders')
@UseGuards(SupabaseAuthGuard)
export class OrderCallController {
  constructor(private readonly calls: OrderCallService) {}

  /** POST /orders/:id/call: start a call (or join the one already ringing). */
  @Post(':id/call')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: throttleTtlMs() } })
  start(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<CallJoin> {
    return this.calls.start(user.id, id);
  }

  /** POST /orders/:id/call/answer */
  @Post(':id/call/answer')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: throttleTtlMs() } })
  answer(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<CallJoin> {
    return this.calls.answer(user.id, id);
  }

  /** POST /orders/:id/call/end: hang up, decline or cancel. */
  @Post(':id/call/end')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: throttleTtlMs() } })
  end(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallSummary | null> {
    return this.calls.end(user.id, id);
  }
}
