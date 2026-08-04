import { setRequestLocale } from "next-intl/server";
import { ForcePasswordChangeForm } from "@/components/auth/ForcePasswordChangeForm";

export const dynamic = "force-dynamic";

/**
 * Forced first-login password change. The middleware parks any authorized user
 * whose shop_staff row has must_change_password = true here (admin-provisioned
 * temporary password) until they set their own; the flag is cleared on success.
 */
export default async function GantiSandiPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ForcePasswordChangeForm locale={locale} />;
}
