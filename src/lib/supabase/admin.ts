import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl, getSupabaseServiceKey } from "./env";

/**
 * Server-ONLY Supabase client using the service role key. Never import this into
 * a client component — the service role bypasses RLS. Used by server actions to
 * record stock movements. Returns null when the key is not configured.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
