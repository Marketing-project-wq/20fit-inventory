/**
 * Supabase configuration readers.
 *
 * `process.env.NEXT_PUBLIC_*` (dot access) is inlined by Next.js at BUILD time,
 * so if the value is not present during `next build` the server ends up with a
 * frozen `undefined`. Reading via bracket notation is NOT inlined and resolves
 * at RUNTIME, so vars set only in the runtime environment (e.g. Railway) still
 * work. We try both, plus non-public fallbacks.
 */
export function getSupabaseUrl(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ||
    process.env["SUPABASE_URL"] ||
    undefined
  );
}

export function getSupabaseAnonKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    undefined
  );
}

export function getSupabaseServiceKey(): string | undefined {
  return process.env["SUPABASE_SERVICE_ROLE_KEY"] || undefined;
}
