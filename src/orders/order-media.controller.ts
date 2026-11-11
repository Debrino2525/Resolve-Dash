import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { throttleTtlMs } from '../common/throttle.config';
import { bearerToken } from '../riders/rider-documents.controller';
import { StoredFile } from '../storage/supabase-storage.client';
import {
  ChatThread,
  MAX_PHOTO_BYTES,
  OrderMediaService,
  UploadedPhoto,
} from './order-media.service';

const photoUpload = FileInterceptor('file', {
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 3 },
});

function sendImage(res: Response, file: StoredFile): void {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.body);
}

/**
 * Package photos and the customer/rider chat. Shared by both apps: the service decides whether
 * the caller is the order's customer or its assigned rider.
 */
@Controller('orders')
@UseGuards(SupabaseAuthGuard)
export class OrderMediaController {
  constructor(private readonly media: OrderMediaService) {}

  /** Customer, while filling in a new delivery. multipart/form-data: file. */
  @Post('package-photo')
  @Throttle({ default: { limit: 10, ttl: throttleTtlMs() } })
  @UseInterceptors(photoUpload)
  uploadPackagePhoto(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @UploadedFile() file: UploadedPhoto | undefined,
  ): Promise<{ photoPath: string }> {
    return this.media.uploadPackagePhoto(user.id, bearerToken(authorization), file);
  }

  @Get(':id/package-photo')
  async packagePhoto(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    sendImage(res, await this.media.readPackagePhoto(user.id, bearerToken(authorization), id));
  }

  /** The customer's view of their rider's approved profile photo (order in progress). */
  @Get(':id/rider-photo')
  async riderPhoto(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    sendImage(res, await this.media.readRiderPhoto(user.id, bearerToken(authorization), id));
  }

  @Get(':id/messages')
  @Throttle({ default: { limit: 60, ttl: throttleTtlMs() } }) // polled every few seconds
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ChatThread> {
    return this.media.thread(user.id, id);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: throttleTtlMs() } })
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { body?: unknown },
  ): Promise<ChatThread> {
    if (typeof body?.body !== 'string') throw new BadRequestException('Type a message');
    return this.media.sendText(user.id, id, body.body);
  }

  /** multipart/form-data: file, optional caption. */
  @Post(':id/messages/photo')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: throttleTtlMs() } })
  @UseInterceptors(photoUpload)
  sendPhoto(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: UploadedPhoto | undefined,
    @Body() body: { caption?: string },
  ): Promise<ChatThread> {
    return this.media.sendPhoto(user.id, bearerToken(authorization), id, file, body?.caption);
  }

  @Get(':id/messages/:messageId/photo')
  async messagePhoto(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Res() res: Response,
  ): Promise<void> {
    sendImage(
      res,
      await this.media.readMessagePhoto(user.id, bearerToken(authorization), id, messageId),
    );
  }
}
