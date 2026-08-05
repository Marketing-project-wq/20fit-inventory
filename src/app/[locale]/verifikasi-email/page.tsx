import { setRequestLocale } from "next-intl/server";
import { EmailVerifyForm } from "@/components/auth/EmailVerifyForm";

export const dynamic = "force-dynamic";

/**
 * Custom sign-up email verification. Reachable without a session (the sign-up
 * flow redirects here right after creating the account) and also where the
 * middleware parks an authenticated-but-unverified user. The `email` query param
 * is prefilled from sign-up / the middleware redirect.
 */
export default async function VerifikasiEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { email } = await searchParams;
  return <EmailVerifyForm locale={locale} initialEmail={email?.trim() ?? ""} />;
}
