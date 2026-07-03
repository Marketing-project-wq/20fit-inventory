"use client";

import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function SortableColumnHeader({
  label,
  sortKey,
  activeSort,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  sortKey: string;
  activeSort: string;
  onSort: (value: string) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const isAsc = activeSort === `${sortKey}:asc`;
  const isDesc = activeSort === `${sortKey}:desc`;
  const isActive = isAsc || isDesc;

  return (
    <th
      className={cn(
        "cursor-pointer select-none whitespace-nowrap px-4 py-3 font-medium",
        className,
      )}
      onClick={() => onSort(isAsc ? `${sortKey}:desc` : `${sortKey}:asc`)}
      aria-sort={isAsc ? "ascending" : isDesc ? "descending" : "none"}
    >
      <div
        className={cn("flex items-center gap-1", align === "right" && "justify-end")}
      >
        <span className={cn(isActive && "text-accent")}>{label}</span>
        <span className="flex flex-col" aria-hidden>
          <ChevronUp
            size={11}
            className={cn("-mb-0.5", isAsc ? "text-accent" : "opacity-30")}
          />
          <ChevronDown
            size={11}
            className={cn(isDesc ? "text-accent" : "opacity-30")}
          />
        </span>
      </div>
    </th>
  );
}
