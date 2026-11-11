import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DatabaseService } from '../database/database.service';

/**
 * Liveness/readiness for the host's health checks and uptime monitors. Public, unthrottled, and
 * reveals nothing beyond "up" and whether the database answers.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @HttpCode(200)
  async check(): Promise<{ status: 'ok'; database: 'ok' }> {
    try {
      await this.db.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'degraded', database: 'unreachable' });
    }
    return { status: 'ok', database: 'ok' };
  }
}
