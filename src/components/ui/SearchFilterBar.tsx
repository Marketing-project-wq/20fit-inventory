"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { inputCls } from "@/components/forms/ui";
import { cn } from "@/lib/utils";

export type FilterOption = { label: string; value: string };
export type FilterConfig = { key: string; label: string; options: FilterOption[] };
export type SortOption = { label: string; value: string };

export function SearchFilterBar({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters = [],
  activeFilters = {},
  onFilterChange,
  sortOptions = [],
  activeSort,
  onSortChange,
  resultCount,
  totalCount,
}: {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (v: string) => void;
  filters?: FilterConfig[];
  activeFilters?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  sortOptions?: SortOption[];
  activeSort?: string;
  onSortChange?: (value: string) => void;
  resultCount?: number;
  totalCount?: number;
}) {
  const tc = useTranslations("common");
  const placeholder = searchPlaceholder ?? tc("search");
  const hasActive =
    searchValue.length > 0 || Object.values(activeFilters).some(Boolean);

  return (
    <div className="mb-4 flex flex-col gap-3" role="search">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative w-full sm:min-w-[200px] sm:flex-1">
          <Search
            size={15}
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className={cn(inputCls, "pl-9 pr-9")}
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label={tc("cancel")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-fg"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Filters */}
        {filters.map((f) => (
          <select
            key={f.key}
            value={activeFilters[f.key] ?? ""}
            onChange={(e) => onFilterChange?.(f.key, e.target.value)}
            aria-label={f.label}
            className={cn(inputCls, "w-auto min-w-[130px] cursor-pointer")}
          >
            <option value="">
              {tc("all")} {f.label}
            </option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}

        {/* Sort */}
        {sortOptions.length > 0 && (
          <select
            value={activeSort ?? ""}
            onChange={(e) => onSortChange?.(e.target.value)}
            aria-label={tc("sortBy")}
            className={cn(inputCls, "w-auto min-w-[150px] cursor-pointer")}
          >
            <option value="">{tc("sortBy")}</option>
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {(resultCount !== undefined || hasActive) && (
        <div className="flex items-center justify-between text-xs text-muted">
          {resultCount !== undefined && totalCount !== undefined ? (
            <span>{tc("showing", { count: resultCount, total: totalCount })}</span>
          ) : (
            <span />
          )}
          {hasActive && (
            <button
              type="button"
              onClick={() => {
                onSearchChange("");
                filters.forEach((f) => onFilterChange?.(f.key, ""));
              }}
              className="text-accent underline underline-offset-2 transition-opacity hover:opacity-80"
            >
              {tc("resetFilters")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
