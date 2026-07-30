"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Segmented ID | EN locale toggle. `preserveQuery` keeps the current query
 * string across the switch (e.g. the login page's `?next=` redirect target);
 * it's read from the live URL in the click handler, so no useSearchParams (and
 * thus no Suspense boundary) is needed. Default off keeps the Header behavior.
 */
export function LanguageSwitcher({
  preserveQuery = false,
}: {
  preserveQuery?: boolean;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-border text-xs font-semibold">
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => {
            const search =
              preserveQuery && typeof window !== "undefined"
                ? window.location.search
                : "";
            router.replace(`${pathname}${search}`, { locale: l });
          }}
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
