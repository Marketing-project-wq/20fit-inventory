"use client";

import { useLocale, useTranslations } from "next-intl";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/actions";

export function LogoutButton() {
  const locale = useLocale();
  const t = useTranslations("auth");

  return (
    <form action={signOut}>
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-danger"
      >
        <LogOut size={18} className="shrink-0" />
        <span>{t("logout")}</span>
      </button>
    </form>
  );
}
