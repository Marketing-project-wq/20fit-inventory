import {
  getSupabaseUrl,
  getSupabaseAnonKey,
  getSupabaseServiceKey,
} from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health — diagnostic. Reports which env the SERVER actually sees at
// runtime (booleans + a masked URL host only — never the key values).
export async function GET() {
  const url = getSupabaseUrl();
  return Response.json({
    ok: true,
    time: new Date().toISOString(),
    env: {
      supabaseUrl: Boolean(url),
      supabaseUrlHost: url ? new URL(url).host : null,
      anonKey: Boolean(getSupabaseAnonKey()),
      serviceRoleKey: Boolean(getSupabaseServiceKey()),
    },
  });
}
