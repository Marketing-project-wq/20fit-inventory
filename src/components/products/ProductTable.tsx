"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatIDR } from "@/lib/utils";
import { StockBadge } from "@/components/badges";
import { QRCodeCell } from "@/components/products/QRCodeCell";
import { SearchFilterBar } from "@/components/ui/SearchFilterBar";
import { SortableColumnHeader } from "@/components/ui/SortableColumnHeader";
import type { Sku } from "@/lib/data";

const statusKey = { ok: "inStock", low: "lowStock", out: "outOfStock" } as const;

export function ProductTable({ skus }: { skus: Sku[] }) {
  const tp = useTranslations("product");
  const ts = useTranslations("stock");
  const tc = useTranslations("common");

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({
    brand: "",
    category: "",
    status: "",
  });
  const [sort, setSort] = useState("name:asc");

  const brands = useMemo(
    () => [...new Set(skus.map((s) => s.brand).filter(Boolean))].sort() as string[],
    [skus],
  );
  const categories = useMemo(
    () => [...new Set(skus.map((s) => s.category).filter(Boolean))].sort() as string[],
    [skus],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = skus.filter((s) => {
      const mSearch =
        !q ||
        s.sku_code.toLowerCase().includes(q) ||
        s.product_name.toLowerCase().includes(q);
      const mBrand = !filters.brand || s.brand === filters.brand;
      const mCat = !filters.category || s.category === filters.category;
      const mStatus = !filters.status || s.status === filters.status;
      return mSearch && mBrand && mCat && mStatus;
    });
    const [field, dir] = sort.split(":");
    const mult = dir === "desc" ? -1 : 1;
    out.sort((a, b) => {
      if (field === "sku") return mult * a.sku_code.localeCompare(b.sku_code);
      if (field === "stock") return mult * (a.on_hand - b.on_hand);
      if (field === "price")
        return mult * ((a.selling_price ?? 0) - (b.selling_price ?? 0));
      return mult * a.product_name.localeCompare(b.product_name, "id");
    });
    return out;
  }, [skus, search, filters, sort]);

  return (
    <div>
      <SearchFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            key: "brand",
            label: tp("brand"),
            options: brands.map((b) => ({ label: b, value: b })),
          },
          {
            key: "category",
            label: tp("category"),
            options: categories.map((c) => ({ label: c, value: c })),
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
          { label: `${tp("productName")} A–Z`, value: "name:asc" },
          { label: `${tp("productName")} Z–A`, value: "name:desc" },
          { label: `${tp("stockOnHand")} ↓`, value: "stock:desc" },
          { label: `${tp("stockOnHand")} ↑`, value: "stock:asc" },
          { label: `${tp("sellingPrice")} ↓`, value: "price:desc" },
          { label: `${tp("sellingPrice")} ↑`, value: "price:asc" },
        ]}
        activeSort={sort}
        onSortChange={setSort}
        resultCount={filtered.length}
        totalCount={skus.length}
      />

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm md:min-w-[840px]">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="hidden px-4 py-3 font-medium md:table-cell">QR</th>
              <SortableColumnHeader
                label={tp("skuCode")}
                sortKey="sku"
                activeSort={sort}
                onSort={setSort}
              />
              <SortableColumnHeader
                label={tp("productName")}
                sortKey="name"
                activeSort={sort}
                onSort={setSort}
              />
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                {tp("brand")}
              </th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                {tp("category")}
              </th>
              <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">
                {tp("costPrice")}
              </th>
              <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">
                {tp("sellingPrice")}
              </th>
              <SortableColumnHeader
                label={tp("stockOnHand")}
                sortKey="stock"
                activeSort={sort}
                onSort={setSort}
                align="right"
              />
              <th className="px-4 py-3 font-medium">{tc("status")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.variant_id}
                className="border-b border-border last:border-0 hover:bg-surface-2"
              >
                <td className="hidden px-4 py-3 md:table-cell">
                  <QRCodeCell sku={s.sku_code} />
                </td>
                <td className="px-4 py-3">
                  <span className="sku">{s.sku_code}</span>
                </td>
                <td className="px-4 py-3 text-fg">{s.product_name}</td>
                <td className="hidden px-4 py-3 text-muted md:table-cell">
                  {s.brand ?? "—"}
                </td>
                <td className="hidden px-4 py-3 text-muted md:table-cell">
                  {s.category ?? "—"}
                </td>
                <td className="hidden px-4 py-3 text-right font-mono text-muted lg:table-cell">
                  {s.cost_price != null ? formatIDR(s.cost_price) : "—"}
                </td>
                <td className="hidden px-4 py-3 text-right font-mono lg:table-cell">
                  {s.selling_price != null ? formatIDR(s.selling_price) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono">{s.on_hand}</td>
                <td className="px-4 py-3">
                  <StockBadge status={s.status} label={ts(statusKey[s.status])} />
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
