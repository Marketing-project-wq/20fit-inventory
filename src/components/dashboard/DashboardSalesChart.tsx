"use client";

import { useTranslations } from "next-intl";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatIDR } from "@/lib/utils";
import type { SalesPoint } from "@/lib/reports";

/** Compact Rupiah for axis ticks: 1.2 M / 3.4 jt / 5 rb. */
function compactIDR(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} M`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} jt`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)} rb`;
  return String(n);
}

/**
 * Daily revenue for the current WIB month, from a day-granularity
 * `salesAggregate` series. Mirrors the Sales Report trend chart's themed style
 * (area + accent gradient) but carries the dashboard's own title/empty state.
 */
export function DashboardSalesChart({ series }: { series: SalesPoint[] }) {
  const t = useTranslations("dashboard");
  const tsr = useTranslations("salesReport");

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-fg">{t("salesTrendTitle")}</h3>
      <div className="h-[280px] w-full">
        {series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            {t("noSalesData")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 8, left: 4, bottom: 8 }}>
              <defs>
                <linearGradient id="dashRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                tick={{ fill: "var(--muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={54}
                tickFormatter={compactIDR}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--fg)", fontWeight: 600 }}
                formatter={(value) => [formatIDR(Number(value)), tsr("revenue")]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                name={tsr("revenue")}
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#dashRev)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
