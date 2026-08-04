import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { signOut } from "@/lib/actions";

export const dynamic = "force-dynamic";

/**
 * Shown to authenticated users who have no ACTIVE shop_staff row of at least
 * viewer (pending / unregistered / deactivated). The middleware role gate parks
 * them here; they see no app navigation — only the message and a sign-out.
 */
export default async function PendingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <AuthShell title={t("pendingTitle")} subtitle={t("pendingMessage")}>
      <form action={signOut}>
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {t("pendingSignOut")}
        </button>
      </form>
    </AuthShell>
  );
}
