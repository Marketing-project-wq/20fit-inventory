"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { StockBadge } from "@/components/badges";
import { SearchFilterBar } from "@/components/ui/SearchFilterBar";
import { SortableColumnHeader } from "@/components/ui/SortableColumnHeader";
import type { StockRow } from "@/lib/data";

const statusKey = { ok: "inStock", low: "lowStock", out: "outOfStock" } as const;

export function StockTable({ rows }: { rows: StockRow[] }) {
  const tp = useTranslations("product");
  const ts = useTranslations("stock");
  const tc = useTranslations("common");

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({
    location: "",
    status: "",
  });
  const [sort, setSort] = useState("available:desc");

  const locations = useMemo(
    () => [...new Set(rows.map((r) => r.location_name))].sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      const mSearch =
        !q ||
        r.sku_code.toLowerCase().includes(q) ||
        r.product_name.toLowerCase().includes(q);
      const mLoc = !filters.location || r.location_name === filters.location;
      const mStatus = !filters.status || r.status === filters.status;
      return mSearch && mLoc && mStatus;
    });
    const [field, dir] = sort.split(":");
    const mult = dir === "desc" ? -1 : 1;
    out.sort((a, b) => {
      if (field === "sku")
        return (
          mult *
          (a.sku_code.localeCompare(b.sku_code) ||
            a.location_name.localeCompare(b.location_name))
        );
      if (field === "onhand") return mult * (a.on_hand - b.on_hand);
      return mult * (a.available - b.available);
    });
    return out;
  }, [rows, search, filters, sort]);

  return (
    <div>
      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            key: "location",
            label: tc("location"),
            options: locations.map((l) => ({ label: l, value: l })),
          },
          {
            key: "status",
            label: tc("status"),
            options: [
              { label: ts("inStock"), value: "ok" },
              { label: ts("lowStock"), value: "low" },
              { label: ts("outOfStock"), value: "out" },
            ],
          },
        ]}
        activeFilters={filters}
        onFilterChange={(k, v) => setFilters((p) => ({ ...p, [k]: v }))}
        sortOptions={[
          { label: `${tc("available")} ↓`, value: "available:desc" },
          { label: `${tc("available")} ↑`, value: "available:asc" },
          { label: `${tp("stockOnHand")} ↓`, value: "onhand:desc" },
          { label: `${tp("skuCode")} A–Z`, value: "sku:asc" },
        ]}
        activeSort={sort}
        onSortChange={setSort}
        resultCount={filtered.length}
        totalCount={rows.length}
      />

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm md:min-w-[720px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <SortableColumnHeader
                label={tp("skuCode")}
                sortKey="sku"
                activeSort={sort}
                onSort={setSort}
              />
              <th className="px-4 py-3 font-medium">{tp("productName")}</th>
              <th className="px-4 py-3 font-medium">{tc("location")}</th>
              <th className="hidden px-4 py-3 text-right font-medium md:table-cell">
                {tp("stockOnHand")}
              </th>
              <th className="hidden px-4 py-3 text-right font-medium md:table-cell">
                {tc("reserved")}
              </th>
              <SortableColumnHeader
                label={tc("available")}
                sortKey="available"
                activeSort={sort}
                onSort={setSort}
                align="right"
              />
              <th className="px-4 py-3 font-medium">{tc("status")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr
                key={`${r.variant_id}-${r.location_id}`}
                className="border-b border-border last:border-0 hover:bg-surface-2"
              >
                <td className="px-4 py-3">
                  <span className="sku">{r.sku_code}</span>
                </td>
                <td className="px-4 py-3 text-fg">{r.product_name}</td>
                <td className="px-4 py-3 text-muted">{r.location_name}</td>
                <td className="hidden px-4 py-3 text-right font-mono md:table-cell">
                  {r.on_hand}
                </td>
                <td className="hidden px-4 py-3 text-right font-mono text-muted md:table-cell">
                  {r.reserved}
                </td>
                <td className="px-4 py-3 text-right font-mono">{r.available}</td>
                <td className="px-4 py-3">
                  <StockBadge status={r.status} label={ts(statusKey[r.status])} />
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
