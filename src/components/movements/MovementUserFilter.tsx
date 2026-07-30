"use client";

import { useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

/**
 * URL-driven server filter for the movement performer (by email), mirroring the
 * Activity Log's pattern: the value lives in the `?user=` query param, and the
 * Mutasi server component re-fetches (via getMovements) on change. Kept separate
 * from MovementTable's client-side type/channel/text filters because this one
 * narrows the server query (so it reaches beyond the capped fetch).
 */
export function MovementUserFilter({ value }: { value: string }) {
  const tm = useTranslations("movement");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next.trim()) sp.set("user", next.trim());
    else sp.delete("user");
    const qs = sp.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  function onChange(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(next), 300);
  }

  return (
    <div className="relative max-w-xs">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        type="text"
        defaultValue={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={tm("filterByUser")}
        aria-label={tm("filterByUser")}
        className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm text-fg outline-none transition-colors focus:border-accent"
        data-pending={pending ? "" : undefined}
      />
    </div>
  );
}
