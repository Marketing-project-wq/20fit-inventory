"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";
import { LogoutButton } from "./LogoutButton";
import { Logo20FIT } from "./Logo20FIT";

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 lg:hidden",
          open ? "block" : "hidden",
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          "app-sidebar fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-border transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ paddingLeft: "var(--safe-left)" }}
      >
        <div
          className="flex h-16 items-center gap-2.5 border-b border-border px-5"
          style={{ height: "calc(4rem + var(--safe-top))", paddingTop: "var(--safe-top)" }}
        >
          <Logo20FIT height={26} />
          <button
            onClick={onClose}
            className="ml-auto text-muted hover:text-fg lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map(({ href, key, icon: Icon }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors lg:text-sm",
                  active
                    ? "bg-accent text-white shadow-sm"
                    : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                <Icon size={18} className="shrink-0" />
                <span className="truncate">{t(key)}</span>
              </Link>
            );
          })}
        </nav>

        <div
          className="border-t border-border p-3"
          style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
        >
          <LogoutButton />
          <div className="mt-2 px-3 text-xs text-dim">v0.3 · PRD v1.4</div>
        </div>
      </aside>
    </>
  );
}
