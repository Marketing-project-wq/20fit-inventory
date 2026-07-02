import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Redirects "/" → "/id" (default locale) and keeps the locale prefix on every route.
export default createMiddleware(routing);

export const config = {
  // Match all paths except API routes, Next internals, and static files (anything with a dot).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
