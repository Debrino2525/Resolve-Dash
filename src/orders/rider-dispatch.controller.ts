import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { throttleTtlMs } from '../common/throttle.config';
import { firstIssue, pinSchema, presenceSchema, stopFailedSchema } from './order.schemas';
import { DispatchState, RiderDispatchService } from './rider-dispatch.service';

/** Rider side of live dispatch. */
@Controller('riders/me')
@UseGuards(SupabaseAuthGuard)
export class RiderDispatchController {
  constructor(private readonly dispatch: RiderDispatchService) {}

  /** On/off duty switch and location heartbeat (~every 10 s while online). */
  @Put('presence')
  presence(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<DispatchState> {
    const r = presenceSchema.safeParse(body ?? {});
    if (!r.success) throw new BadRequestException(firstIssue(r.error));
    return this.dispatch.updatePresence(user.id, r.data);
  }

  @Get('dispatch')
  state(@CurrentUser() user: AuthUser): Promise<DispatchState> {
    return this.dispatch.state(user.id);
  }

  @Post('offers/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DispatchState> {
    return this.dispatch.accept(user.id, id);
  }

  @Post('offers/:id/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DispatchState> {
    return this.dispatch.decline(user.id, id);
  }

  @Post('jobs/:id/picked-up')
  @HttpCode(HttpStatus.OK)
  pickedUp(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DispatchState> {
    return this.dispatch.pickedUp(user.id, id);
  }

  @Post('jobs/:id/delivered')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: throttleTtlMs() } })
  delivered(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<DispatchState> {
    const r = pinSchema.safeParse(body ?? {});
    if (!r.success) throw new BadRequestException(firstIssue(r.error));
    return this.dispatch.delivered(user.id, id, r.data.pin);
  }

  /** Multi-stop: hand over at a drop-off before the final one, with that stop's PIN. */
  @Post('jobs/:id/stops/:index/delivered')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: throttleTtlMs() } })
  stopDelivered(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() body: unknown,
  ): Promise<DispatchState> {
    const r = pinSchema.safeParse(body ?? {});
    if (!r.success) throw new BadRequestException(firstIssue(r.error));
    return this.dispatch.stopDelivered(user.id, id, index, r.data.pin);
  }

  /** Multi-stop: couldn't hand over at this drop-off; record why and carry on. */
  @Post('jobs/:id/stops/:index/failed')
  @HttpCode(HttpStatus.OK)
  stopFailed(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('index', ParseIntPipe) index: number,
    @Body() body: unknown,
  ): Promise<DispatchState> {
    const r = stopFailedSchema.safeParse(body ?? {});
    if (!r.success) throw new BadRequestException(firstIssue(r.error));
    return this.dispatch.stopFailed(user.id, id, index, r.data.reason);
  }

  @Post('jobs/:id/release')
  @HttpCode(HttpStatus.OK)
  release(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DispatchState> {
    return this.dispatch.release(user.id, id);
  }
}
