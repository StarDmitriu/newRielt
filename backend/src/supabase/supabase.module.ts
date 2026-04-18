import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { PostgresSupabaseService } from './postgres-supabase.service';

@Module({
  providers: [
    PostgresSupabaseService,
    {
      provide: SupabaseService,
      useExisting: PostgresSupabaseService,
    },
  ],
  exports: [SupabaseService],
})
export class SupabaseModule {}
