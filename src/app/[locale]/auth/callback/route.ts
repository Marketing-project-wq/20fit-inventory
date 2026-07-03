import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Supabase auth callback. The password-reset email links here with a `?code=`;
 * we exchange it for a session (sets the auth cookies) and forward to the
 * `next` page (the reset form). On any failure we send the user to the reset
 * page with an error flag so they can request a fresh link.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  const rawNext = url.searchParams.get("next") ?? "";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : `/${locale}/reset-sandi`;

  if (code) {
    const sb = await createSupabaseServerClient();
    if (sb) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(
    new URL(`/${locale}/reset-sandi?error=invalid`, url.origin),
  );
}
