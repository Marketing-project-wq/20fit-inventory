"use client";

import { Menu, QrCode, Bell } from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Header({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6">
      <button
        onClick={onMenu}
        className="text-muted hover:text-fg lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      <button className="hidden items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:border-accent hover:text-fg sm:flex">
        <QrCode size={16} />
        <span>Scan QR</span>
      </button>
      <button
        className="text-muted transition-colors hover:text-fg"
        aria-label="Notifications"
      >
        <Bell size={18} />
      </button>
      <LanguageSwitcher />
    </header>
  );
}
