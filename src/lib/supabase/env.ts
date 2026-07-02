/**
 * Supabase configuration readers.
 *
 * `process.env.NEXT_PUBLIC_*` (dot access) is inlined by Next.js at BUILD time,
 * so a value missing during `next build` becomes a frozen `undefined`. We read
 * via bracket notation too (resolved at RUNTIME) and fall back to built-in
 * public defaults.
 *
 * The project URL and anon key are PUBLIC values for the shared 20FIT project
 * (the anon key is designed to ship in client bundles and is protected by RLS),
 * so shipping them as defaults is safe and lets the app work with zero env setup.
 * The SERVICE ROLE key is secret and has NO default — it must be set in the host
 * environment to enable write features.
 */
const DEFAULT_URL = "https://cpvzwqptzcxnwzfzgrmt.supabase.co";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwdnp3cXB0emN4bnd6Znpncm10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzE0MzksImV4cCI6MjA5MTIwNzQzOX0.DIP-tTFxa3GHMhT6b1Tq-Zz0a24P-vbU9ixEtITbqpI";

export function getSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env["NEXT_PUBLIC_SUPABASE_URL"] ||
    process.env["SUPABASE_URL"] ||
    DEFAULT_URL
  );
}

export function getSupabaseAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    DEFAULT_ANON_KEY
  );
}

export function getSupabaseServiceKey(): string | undefined {
  return process.env["SUPABASE_SERVICE_ROLE_KEY"] || undefined;
}
