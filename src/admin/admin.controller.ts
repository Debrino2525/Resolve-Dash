import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminGuard } from '../auth/admin.guard';
import { AdminAuthService, AdminSession } from './admin-auth.service';
import { ADMIN_PAGE_HTML, ADMIN_PAGE_JS } from './admin.page';
import { AdminService } from './admin.service';
import { AdminRiderOverview, AdminStats } from './admin.types';

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
});

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminAuthService: AdminAuthService,
  ) {}

  /** Public: exchanges admin email + password for a Supabase access token (admin role only). */
  @Post('api/login')
  @HttpCode(HttpStatus.OK)
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
    const stats = await this.adminService.getStats();
    const riders = await this.adminService.listRiders();
    return { stats, riders };
  }

  @Post('api/riders/:id/approve')
  @UseGuards(AdminGuard)
  async approveRider(@Param('id', ParseUUIDPipe) id: string): Promise<AdminRiderOverview> {
    return this.adminService.approveRider(id);
  }

  @Post('api/riders/:id/reject')
  @UseGuards(AdminGuard)
  async rejectRider(@Param('id', ParseUUIDPipe) id: string): Promise<AdminRiderOverview> {
    return this.adminService.rejectRider(id);
  }

  @Post('api/riders/:id/grant-access')
  @UseGuards(AdminGuard)
  async grantAccess(@Param('id', ParseUUIDPipe) id: string): Promise<AdminRiderOverview> {
    return this.adminService.grantSubscriptionAccess(id, 7);
  }

  /** Public static shell: contains no rider data; the script signs in before loading any. */
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  getAdminDashboardHtml(): string {
    return ADMIN_PAGE_HTML;
  }

  @Get('app.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  getAdminDashboardJs(): string {
    return ADMIN_PAGE_JS;
  }
}
