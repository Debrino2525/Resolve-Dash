import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { bearerToken } from '../riders/rider-documents.controller';
import { DocumentChecklist, RiderDocumentsService } from '../riders/rider-documents.service';
import { z } from 'zod';
import { AdminGuard } from '../auth/admin.guard';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { authThrottleLimit, throttleTtlMs } from '../common/throttle.config';
import { AdminAuthService, AdminSession } from './admin-auth.service';
import { AdminInsightsService } from './admin-insights.service';
import { readPortalAsset } from './admin-portal.assets';
import { AdminService } from './admin.service';
import {
  AdminDashboard,
  AdminPayment,
  AdminRiderDetail,
  AdminRiderOverview,
  AdminStats,
} from './admin.types';

const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(500).optional(),
});

const noteSchema = z.object({ reason: z.string().trim().max(500).optional() });

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
});

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminAuthService: AdminAuthService,
    private readonly riderDocuments: RiderDocumentsService,
    private readonly insights: AdminInsightsService,
  ) {}

  /** Public: exchanges admin email + password for a Supabase access token (admin role only). */
  @Post('api/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: authThrottleLimit(), ttl: throttleTtlMs() } })
  async login(@Body() body: unknown): Promise<AdminSession> {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('A valid email and password are required');
    }
    return this.adminAuthService.login(parsed.data.email, parsed.data.password);
  }

  @Get('api/riders')
  @UseGuards(AdminGuard)
  async getRiders(): Promise<{ stats: AdminStats; riders: AdminRiderOverview[] }> {
    return this.adminService.getOverview();
  }

  /** KPIs, 14-day series, needs-attention list and recent activity for the Overview page. */
  @Get('api/dashboard')
  @UseGuards(AdminGuard)
  getDashboard(): Promise<AdminDashboard> {
    return this.insights.getDashboard();
  }

  @Get('api/riders/:id')
  @UseGuards(AdminGuard)
  getRiderDetail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminRiderDetail> {
    return this.insights.getRiderDetail(id);
  }

  @Get('api/payments')
  @UseGuards(AdminGuard)
  getPayments(@Query('status') status?: string): Promise<AdminPayment[]> {
    return this.insights.listPayments(status?.toUpperCase());
  }

  @Post('api/riders/:id/approve')
  @UseGuards(AdminGuard)
  async approveRider(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
  ): Promise<AdminRiderOverview> {
    return this.adminService.approveRider(id, admin.id);
  }

  @Post('api/riders/:id/reject')
  @UseGuards(AdminGuard)
  async rejectRider(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
    @Body() body: unknown,
  ): Promise<AdminRiderOverview> {
    return this.adminService.rejectRider(id, admin.id, noteSchema.parse(body ?? {}).reason);
  }

  @Post('api/riders/:id/grant-access')
  @UseGuards(AdminGuard)
  async grantAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
    @Body() body: unknown,
  ): Promise<AdminRiderOverview> {
    return this.adminService.grantSubscriptionAccess(
      id,
      7,
      admin.id,
      noteSchema.parse(body ?? {}).reason,
    );
  }

  /** The rider's four compliance documents and their review status (no file contents). */
  @Get('api/riders/:id/documents')
  @UseGuards(AdminGuard)
  getRiderDocuments(@Param('id', ParseUUIDPipe) id: string): Promise<DocumentChecklist> {
    return this.riderDocuments.getChecklistForAdmin(id);
  }

  /**
   * Streams one document's file. Storage is read with the admin's own JWT, so the bucket
   * policy (admin role) is what grants access, not a server-wide key.
   */
  @Get('api/riders/:id/documents/:docId/file')
  @UseGuards(AdminGuard)
  async getRiderDocumentFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.riderDocuments.readFileForAdmin(id, docId, bearerToken(authorization));
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.body);
  }

  @Post('api/riders/:id/documents/:docId/review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard)
  reviewRiderDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docId', ParseUUIDPipe) docId: string,
    @Body() body: unknown,
    @CurrentUser() admin: AuthUser,
  ): Promise<DocumentChecklist> {
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('decision must be APPROVED or REJECTED');
    }
    return this.riderDocuments.review(id, docId, parsed.data.decision, parsed.data.note, admin.id);
  }

  /** Public static shell: contains no rider data; the script signs in before loading any. */
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  getAdminDashboardHtml(): string {
    return readPortalAsset('index.html');
  }

  @Get('app.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  getAdminDashboardJs(): string {
    return readPortalAsset('app.js');
  }

  @Get('app.css')
  @Header('Content-Type', 'text/css; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  getAdminDashboardCss(): string {
    return readPortalAsset('app.css');
  }
}
