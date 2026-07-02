import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-ONLY Supabase client using the service role key. Never import this into
 * a client component — the service role bypasses RLS. Used by server actions to
 * record stock movements. Returns null when the key is not configured.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
