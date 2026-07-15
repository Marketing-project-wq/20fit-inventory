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
      className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6"
      style={{
        // Keep the header clear of the notch/status bar in standalone mode.
        paddingTop: "var(--safe-top)",
        height: "calc(4rem + var(--safe-top))",
      }}
    >
      <button
        onClick={onMenu}
        className="text-muted hover:text-fg lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Logo shows in the top bar on mobile, where the sidebar is a drawer. */}
      <Logo20FIT height={24} className="lg:hidden" />

      <div className="flex-1" />

      <Link
        href="/scan"
        className="hidden items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-fg sm:flex"
      >
        <QrCode size={16} />
        <span>{t("scanQR")}</span>
      </Link>
      <button
        className="text-muted transition-colors hover:text-fg"
        aria-label="Notifications"
      >
        <Bell size={18} />
      </button>
      <ThemeToggle />
      <LanguageSwitcher />
    </header>
  );
}
