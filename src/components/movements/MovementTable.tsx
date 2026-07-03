"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { MovementBadge, MOVEMENT_KEY } from "@/components/badges";
import { SearchFilterBar } from "@/components/ui/SearchFilterBar";
import { SortableColumnHeader } from "@/components/ui/SortableColumnHeader";
import type { Movement } from "@/lib/data";

const CHANNEL_LABEL: Record<string, string> = {
  offline: "Offline",
  tokopedia: "Tokopedia",
  shopee: "Shopee",
  b2b_direct: "B2B",
  other: "Other",
};

export function MovementTable({ movements }: { movements: Movement[] }) {
  const tp = useTranslations("product");
  const tc = useTranslations("common");
  const tm = useTranslations("movement");

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({
    type: "",
    channel: "",
  });
  const [sort, setSort] = useState("date:desc");

  const types = useMemo(
    () => [...new Set(movements.map((m) => m.movement_type))],
    [movements],
  );
  const channels = useMemo(
    () =>
      [...new Set(movements.map((m) => m.sales_channel).filter(Boolean))] as string[],
    [movements],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = movements.filter((m) => {
      const mSearch =
        !q ||
        m.sku_code.toLowerCase().includes(q) ||
        m.product_name.toLowerCase().includes(q) ||
        (m.notes?.toLowerCase().includes(q) ?? false);
      const mType = !filters.type || m.movement_type === filters.type;
      const mChannel = !filters.channel || m.sales_channel === filters.channel;
      return mSearch && mType && mChannel;
    });
    const [, dir] = sort.split(":");
    const mult = dir === "asc" ? 1 : -1;
    out.sort(
      (a, b) =>
        mult *
        (new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()),
    );
    return out;
  }, [movements, search, filters, sort]);

  return (
    <div>
      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            key: "type",
            label: tc("type"),
            options: types.map((ty) => ({
              label: tm(MOVEMENT_KEY[ty] ?? "sale"),
              value: ty,
            })),
          },
          {
            key: "channel",
            label: tc("channel"),
            options: channels.map((ch) => ({
              label: CHANNEL_LABEL[ch] ?? ch,
              value: ch,
            })),
          },
        ]}
        activeFilters={filters}
        onFilterChange={(k, v) => setFilters((p) => ({ ...p, [k]: v }))}
        sortOptions={[
          { label: `${tc("date")} ↓`, value: "date:desc" },
          { label: `${tc("date")} ↑`, value: "date:asc" },
        ]}
        activeSort={sort}
        onSortChange={setSort}
        resultCount={filtered.length}
        totalCount={movements.length}
      />

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm md:min-w-[860px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <SortableColumnHeader
                label={tc("date")}
                sortKey="date"
                activeSort={sort}
                onSort={setSort}
              />
              <th className="px-4 py-3 font-medium">{tc("type")}</th>
              <th className="px-4 py-3 font-medium">{tp("skuCode")}</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                {tp("productName")}
              </th>
              <th className="px-4 py-3 text-right font-medium">{tc("quantity")}</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                {tc("channel")}
              </th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                {tc("notes")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr
                key={m.movement_id}
                className="border-b border-border last:border-0 hover:bg-surface-2"
              >
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                  {format(new Date(m.performed_at), "dd MMM yyyy")}
                </td>
                <td className="px-4 py-3">
                  <MovementBadge
                    type={m.movement_type}
                    label={tm(MOVEMENT_KEY[m.movement_type] ?? "sale")}
                  />
                </td>
                <td className="px-4 py-3">
                  <span className="sku">{m.sku_code}</span>
                </td>
                <td className="hidden px-4 py-3 text-muted md:table-cell">
                  {m.product_name}
                </td>
                <td className="px-4 py-3 text-right font-mono">{m.quantity}</td>
                <td className="hidden px-4 py-3 text-xs text-muted lg:table-cell">
                  {m.sales_channel
                    ? (CHANNEL_LABEL[m.sales_channel] ?? m.sales_channel)
                    : "—"}
                </td>
                <td className="hidden max-w-[220px] truncate px-4 py-3 text-xs text-dim lg:table-cell">
                  {m.notes ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-10 text-center text-sm text-muted">{tc("noData")}</div>
        )}
      </div>
    </div>
  );
}
