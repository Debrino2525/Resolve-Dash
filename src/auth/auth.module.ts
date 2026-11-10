import { Global, Module } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { SupabaseAuthGuard } from './supabase-auth.guard';

@Global()
@Module({
  providers: [SupabaseAuthGuard, AdminGuard],
  exports: [SupabaseAuthGuard, AdminGuard],
})
export class AuthModule {}
