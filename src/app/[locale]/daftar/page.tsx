import { setRequestLocale } from "next-intl/server";
import { SignUpForm } from "@/components/auth/SignUpForm";

export const dynamic = "force-dynamic";

/**
 * Public self-service sign-up. Anyone may register; an @20fit.id address becomes
 * active staff, any other address lands as pending (admin approval required).
 * Email verification is enabled, so sign-up ends on a "check your email" notice.
 */
export default async function DaftarPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SignUpForm locale={locale} />;
}
