import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
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
import {
  DocumentChecklist,
  DocumentInput,
  MAX_DOCUMENT_BYTES,
  RiderDocumentsService,
  UploadedDocumentFile,
} from './rider-documents.service';

/** Bearer token from the Authorization header (already verified by SupabaseAuthGuard). */
export function bearerToken(authorization: string | undefined): string {
  return (authorization ?? '').replace(/^Bearer\s+/i, '').trim();
}

@Controller('riders/me/documents')
@UseGuards(SupabaseAuthGuard)
export class RiderDocumentsController {
  constructor(private readonly documents: RiderDocumentsService) {}

  @Get()
  getChecklist(@CurrentUser() user: AuthUser): Promise<DocumentChecklist> {
    return this.documents.getChecklist(user.id);
  }

  /** The rider's own profile photo (their avatar in the app). */
  @Get('profile-photo')
  async profilePhoto(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.documents.readOwnProfilePhoto(user.id, bearerToken(authorization));
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.body);
  }

  /**
   * multipart/form-data: file (JPG/PNG/WebP/PDF, max 5 MB), documentNumber, expiryDate (YYYY-MM-DD).
   * Resubmitting a type replaces it and sends it back for review.
   */
  @Post(':type')
  @Throttle({ default: { limit: 12, ttl: throttleTtlMs() } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 5 } }),
  )
  submit(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string | undefined,
    @Param('type') type: string,
    @Body() body: DocumentInput,
    @UploadedFile() file: UploadedDocumentFile | undefined,
  ): Promise<DocumentChecklist> {
    return this.documents.submit(
      user.id,
      bearerToken(authorization),
      type.toUpperCase(),
      { documentNumber: body?.documentNumber, expiryDate: body?.expiryDate },
      file,
    );
  }
}
