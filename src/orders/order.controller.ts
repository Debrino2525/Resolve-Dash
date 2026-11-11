import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { throttleTtlMs } from '../common/throttle.config';
import {
  cancelSchema,
  createOrderSchema,
  firstIssue,
  pointSchema,
  quoteSchema,
  rateSchema,
} from './order.schemas';
import { OrderService, QuoteResult } from './order.service';
import { CustomerOrderView } from './order.types';

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new BadRequestException(firstIssue(r.error));
  return r.data;
}

/** Customer delivery orders (cash on delivery). */
@Controller('orders')
@UseGuards(SupabaseAuthGuard)
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: throttleTtlMs() } }) // each quote is a Mapbox request
  quote(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<QuoteResult> {
    const b = parse(quoteSchema, body);
    return this.orders.quote(user.id, b.pickup, b.dropoff);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: throttleTtlMs() } })
  create(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<CustomerOrderView> {
    const b = parse(createOrderSchema, body);
    return this.orders.create(user.id, {
      pickup: b.pickup,
      dropoff: b.dropoff,
      packageType: b.packageType,
      fragile: b.fragile,
      notes: b.notes,
      quoteToken: b.quoteToken,
      packagePhotoPath: b.packagePhotoPath ?? null,
    });
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<CustomerOrderView[]> {
    return this.orders.list(user.id);
  }

  /** Declared before :id so "nearby-riders" is not parsed as an order id. */
  @Get('nearby-riders')
  nearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ): Promise<{ count: number; riders: { lat: number; lng: number }[] }> {
    const p = parse(pointSchema, { lat: Number(lat), lng: Number(lng) });
    return this.orders.nearbyRiders(p);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CustomerOrderView> {
    return this.orders.get(user.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CustomerOrderView> {
    return this.orders.cancel(user.id, id, parse(cancelSchema, body).reason);
  }

  @Post(':id/rate')
  @HttpCode(HttpStatus.OK)
  rate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ): Promise<CustomerOrderView> {
    const b = parse(rateSchema, body);
    return this.orders.rate(user.id, id, b.stars, b.tags, b.comment);
  }
}
