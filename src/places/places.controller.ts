import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { throttleTtlMs } from '../common/throttle.config';
import { PlaceDetails, PlaceSuggestion, PlacesService } from './places.service';

function optionalPoint(lat?: string, lng?: string): { lat: number; lng: number } | null {
  if (lat === undefined || lng === undefined) return null;
  const p = { lat: Number(lat), lng: Number(lng) };
  if (
    !Number.isFinite(p.lat) ||
    !Number.isFinite(p.lng) ||
    Math.abs(p.lat) > 90 ||
    Math.abs(p.lng) > 180
  ) {
    throw new BadRequestException('Invalid position');
  }
  return p;
}

/** Signed-in users only, so the paid Google API can't be used anonymously. */
@Controller('places')
@UseGuards(SupabaseAuthGuard)
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  /** GET /places/autocomplete?q=Accra%20Mall&session=<uuid>&lat=5.6&lng=-0.18 */
  @Get('autocomplete')
  @Throttle({ default: { limit: 60, ttl: throttleTtlMs() } }) // typing sends a request per pause
  autocomplete(
    @Query('q') q = '',
    @Query('session') session = '',
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ): Promise<{ enabled: boolean; suggestions: PlaceSuggestion[] }> {
    return this.places.autocomplete(q, session, optionalPoint(lat, lng));
  }

  /** GET /places/details?id=<placeId>&session=<uuid> */
  @Get('details')
  @Throttle({ default: { limit: 30, ttl: throttleTtlMs() } })
  details(@Query('id') id = '', @Query('session') session = ''): Promise<PlaceDetails> {
    return this.places.details(id, session);
  }
}
