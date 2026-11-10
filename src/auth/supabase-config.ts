const DEFAULT_SUPABASE_URL = 'https://tllhlkpeepkopzxvxhvc.supabase.co';

/** Supabase project URL without a trailing slash. */
export function getSupabaseUrl(): string {
  return (process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
}
