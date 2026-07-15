"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Search, Download, RotateCcw } from "lucide-react";
import type { AuditLogRow, AuditLogFilters } from "@/lib/data";
import { exportAuditLogsCsv } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { DiffButton } from "./DiffButton";

const MODULE_KEYS = [
  "barang_masuk",
  "barang_keluar",
  "transfer",
  "stock_opname",
  "pengaturan",
  "mutasi_stok",
  "laporan",
] as const;

const moduleTone: Record<string, string> = {
  barang_masuk: "border-success text-success",
  barang_keluar: "border-danger text-danger",
  transfer: "border-info text-info",
  stock_opname: "border-warning text-warning",
  pengaturan: "border-dim text-muted",
  mutasi_stok: "border-dim text-muted",
  laporan: "border-dim text-muted",
};

export function ActivityLogView({
  rows,
  total,
  page,
  pageSize,
  filters,
}: {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: AuditLogFilters;
}) {
  const t = useTranslations("activityLog");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(filters.search ?? "");
  useEffect(() => setSearch(filters.search ?? ""), [filters.search]);

  // Push a changed param set to the URL; the server component re-fetches.
  const push = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    if (!("page" in next)) sp.delete("page"); // any filter change resets page
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  };

  // Debounce the free-text search.
  useEffect(() => {
    const current = filters.search ?? "";
    if (search === current) return;
    const id = setTimeout(() => push({ search }), 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters = Boolean(
    filters.search || filters.module || filters.user || filters.from || filters.to,
  );
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  const totalPages = Math.ceil(total / pageSize);

  const selectCls =
    "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent";

  const [exporting, setExporting] = useState(false);
  const onExport = async () => {
    setExporting(true);
    try {
      const res = await exportAuditLogsCsv(filters);
      if (res.ok && res.csv) {
        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `activity_log_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      }
    } finally {
      setExporting(false);
    }
  };

  const localeNum = useMemo(() => new Intl.NumberFormat("id-ID"), []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("subtitle")} ·{" "}
            <span className="font-mono text-xs">
              {t("entryCount", { count: localeNum.format(total) })}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={exporting || total === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs font-medium text-fg transition hover:border-accent disabled:opacity-50"
        >
          <Download size={14} />
          {exporting ? tc("loading") : t("exportCsv")}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-surface p-4">
        <div className="relative min-w-48 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dim"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-lg border border-border bg-bg py-2 pl-9 pr-3 text-sm text-fg outline-none focus:border-accent"
          />
        </div>

        <select
          value={filters.module ?? ""}
          onChange={(e) => push({ module: e.target.value })}
          className={selectCls}
        >
          <option value="">{t("filterModule")}</option>
          {MODULE_KEYS.map((m) => (
            <option key={m} value={m}>
              {t(`modules.${m}`)}
            </option>
          ))}
        </select>

        <input
          type="text"
          defaultValue={filters.user ?? ""}
          onBlur={(e) => push({ user: e.target.value.trim() })}
          onKeyDown={(e) => {
            if (e.key === "Enter") push({ user: e.currentTarget.value.trim() });
          }}
          placeholder={t("filterUser")}
          className="min-w-40 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        />

        <input
          type="date"
          value={filters.from ?? ""}
          onChange={(e) => push({ from: e.target.value })}
          aria-label={t("filterFrom")}
          className={`${selectCls} font-mono`}
        />
        <input
          type="date"
          value={filters.to ?? ""}
          onChange={(e) => push({ to: e.target.value })}
          aria-label={t("filterTo")}
          className={`${selectCls} font-mono`}
        />

        {hasFilters && (
          <button
            type="button"
            onClick={() =>
              startTransition(() => router.push(pathname))
            }
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-danger underline-offset-2 hover:underline"
          >
            <RotateCcw size={13} />
            {t("resetFilter")}
          </button>
        )}
      </div>

      {/* Table */}
      <div
        className={cn(
          "overflow-x-auto rounded-xl border border-border bg-surface transition-opacity",
          isPending && "opacity-60",
        )}
      >
        <table className="w-full text-sm md:min-w-[820px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">{t("colTime")}</th>
              <th className="px-4 py-3 font-medium">{t("colUser")}</th>
              <th className="px-4 py-3 font-medium">{t("colModule")}</th>
              <th className="px-4 py-3 font-medium">{t("colActivity")}</th>
              <th className="px-4 py-3 font-medium">{t("colDetail")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((log) => (
              <tr
                key={log.log_id}
                className="border-b border-border last:border-0 hover:bg-surface-2"
              >
                <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-muted">
                  {format(new Date(log.created_at), "dd MMM yyyy, HH:mm:ss")}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-fg">{log.user_name ?? t("system")}</div>
                  <div className="font-mono text-[10px] text-dim">
                    {log.user_email ?? "—"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {log.module ? (
                    <span
                      className={cn(
                        "font-display inline-flex items-center whitespace-nowrap rounded-full border bg-transparent px-2.5 py-0.5 text-[11px] font-bold",
                        moduleTone[log.module] ?? "border-dim text-muted",
                      )}
                    >
                      {t(`modules.${log.module}`)}
                    </span>
                  ) : (
                    <span className="text-dim">—</span>
                  )}
                </td>
                <td className="max-w-80 px-4 py-3 text-fg">
                  {log.description ?? log.action}
                </td>
                <td className="px-4 py-3">
                  {(log.before_value || log.after_value) && (
                    <DiffButton before={log.before_value} after={log.after_value} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-10 text-center text-sm text-muted">{t("noActivity")}</div>
        )}
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            {t("showingOf", { from, to, total })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => push({ page: String(page - 1) })}
              className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg transition hover:border-accent disabled:opacity-40"
            >
              ← {t("prev")}
            </button>
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => push({ page: String(page + 1) })}
              className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium text-fg transition hover:border-accent disabled:opacity-40"
            >
              {t("next")} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
