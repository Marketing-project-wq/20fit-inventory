"use client";

import { Menu, QrCode, Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { Logo20FIT } from "./Logo20FIT";

export function Header({ onMenu }: { onMenu: () => void }) {
  const t = useTranslations("dashboard");
  return (
    <header
      className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-bg/80 px-4 backdrop-blur sm:gap-3 sm:px-6"
      style={{
        // Keep the header clear of the notch/status bar in standalone mode.
        paddingTop: "var(--safe-top)",
        height: "calc(4rem + var(--safe-top))",
      }}
    >
      <button
        onClick={onMenu}
        className="shrink-0 text-muted hover:text-fg lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Logo shows in the top bar on mobile, where the sidebar is a drawer.
          Smaller on phones so the language + theme controls always fit. */}
      <Logo20FIT height={22} className="lg:hidden" />

      <div className="min-w-0 flex-1" />

      <Link
        href="/scan"
        aria-label={t("scanQR")}
        className="flex shrink-0 items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-fg sm:px-3"
      >
        <QrCode size={16} />
        <span className="hidden sm:inline">{t("scanQR")}</span>
      </Link>
      {/* Decorative placeholder — hidden on phones to leave room for the controls. */}
      <button
        className="hidden shrink-0 text-muted transition-colors hover:text-fg sm:block"
        aria-label="Notifications"
      >
        <Bell size={18} />
      </button>
      <ThemeToggle />
      <LanguageSwitcher />
    </header>
  );
}
