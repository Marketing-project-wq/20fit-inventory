import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { error } = await searchParams;

  // The reset link is exchanged for a recovery session in /auth/callback, so a
  // valid arrival here means getUser() returns the user whose password we set.
  const user = await getCurrentUser();

  return (
    <ResetPasswordForm
      locale={locale}
      hasSession={Boolean(user)}
      linkError={error === "invalid"}
    />
  );
}
