import { NextResponse, type NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { routing } from "./i18n/routing";
import { getSupabaseUrl, getSupabaseAnonKey } from "./lib/supabase/env";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // 1. Locale routing: redirects "/" -> "/id" and keeps the locale prefix.
  const response = intlMiddleware(request);
  // If next-intl issued a redirect, honor it before running auth.
  if (response.headers.get("location")) return response;

  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  // Auth not configured yet -> don't gate (keeps the app usable during setup).
  if (!url || !key) return response;

  // 2. Refresh the Supabase session (reads/writes auth cookies).
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null; // treat auth errors as unauthenticated (fail closed)
  }

  // 3. Route protection.
  const pathname = request.nextUrl.pathname;
  const seg = pathname.split("/")[1];
  const locale = (routing.locales as readonly string[]).includes(seg)
    ? seg
    : routing.defaultLocale;
  const isLoginPage = pathname === `/${locale}/login`;
  // Auth screens reachable without a session: sign-in, the password-reset
  // request/confirm pages, and the callback that exchanges the reset code.
  const publicAuthPaths = new Set([
    `/${locale}/login`,
    `/${locale}/lupa-sandi`,
    `/${locale}/reset-sandi`,
    `/${locale}/auth/callback`,
  ]);
  const isPublic = publicAuthPaths.has(pathname);

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${locale}/login`;
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }
  if (user && isLoginPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${locale}`;
    redirectUrl.searchParams.delete("next");
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
