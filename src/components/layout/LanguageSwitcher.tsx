"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-border text-xs font-semibold">
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => router.replace(pathname, { locale: l })}
          className={cn(
            "px-2.5 py-1.5 uppercase transition-colors",
            locale === l
              ? "bg-accent text-white"
              : "text-muted hover:text-fg",
          )}
          aria-current={locale === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
