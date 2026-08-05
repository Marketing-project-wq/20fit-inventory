"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type Opt = { value: string; label: string };

const PRESETS = [
  { value: "today", key: "today" },
  { value: "week", key: "thisWeek" },
  { value: "month", key: "thisMonth" },
  { value: "year", key: "thisYear" },
] as const;

export function SalesFilterBar({
  preset,
  from,
  to,
  channel,
  category,
  channels,
  categories,
}: {
  preset: string;
  from: string;
  to: string;
  channel: string;
  category: string;
  channels: Opt[];
  categories: Opt[];
}) {
  const t = useTranslations("salesReport");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const push = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  };

  const selectCls =
    "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent";

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4 transition-opacity",
        isPending && "opacity-60",
      )}
    >
      {/* Preset period chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => push({ preset: p.value, from: null, to: null })}
            aria-pressed={preset === p.value}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
              preset === p.value
                ? "border-accent bg-accent text-white"
                : "border-border text-muted hover:text-fg",
            )}
          >
            {t(p.key)}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("from")}
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) =>
              push({ preset: "custom", from: e.target.value, to: to || e.target.value })
            }
            className={cn(selectCls, "font-mono")}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("to")}
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) =>
              push({ preset: "custom", from: from || e.target.value, to: e.target.value })
            }
            className={cn(selectCls, "font-mono")}
          />
        </label>
      </div>

      {/* Channel + category */}
      <label className="flex flex-col gap-1 text-xs text-muted">
        {t("channel")}
        <select
          value={channel}
          onChange={(e) => push({ channel: e.target.value || null })}
          className={selectCls}
        >
          <option value="">{t("allChannels")}</option>
          {channels.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        {t("category")}
        <select
          value={category}
          onChange={(e) => push({ category: e.target.value || null })}
          className={selectCls}
        >
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
