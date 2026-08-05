"use client";

import { useTranslations } from "next-intl";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  Bar,
  Line,
  BarChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { formatIDR } from "@/lib/utils";
import type {
  SalesPoint,
  ChannelStat,
  CategoryStat,
  SkuStat,
} from "@/lib/reports";

// Fixed channel display labels (proper nouns / brand names), mirroring the
// filter dropdown. Unknown channels fall back to their raw key.
const CHANNEL_LABEL: Record<string, string> = {
  b2b_direct: "B2B Direct",
  offline: "Offline",
  tokopedia: "Tokopedia",
  shopee: "Shopee",
  other: "Other",
};

// Categorical palette — accent first, then distinct mid-tone hues that read in
// both light and dark themes.
const PALETTE = [
  "var(--accent)",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#3b82f6",
  "#22c55e",
  "#ef4444",
];

/** Compact Rupiah for axis ticks: 1,2 M (miliar) / 3,4 jt (juta) / 5 rb. */
function compactIDR(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} M`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} jt`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)} rb`;
  return String(n);
}

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
} as const;

function ChartCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  const tc = useTranslations("common");
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-4 text-sm font-semibold text-fg">{title}</h3>
      <div className="h-[280px] w-full">
        {empty ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            {tc("noData")}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function SalesTrendChart({ series }: { series: SalesPoint[] }) {
  const t = useTranslations("salesReport");
  return (
    <ChartCard title={t("revenueTrend")} empty={series.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 4, right: 8, left: 4, bottom: 8 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
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
            contentStyle={tooltipStyle}
            labelStyle={{ color: "var(--fg)", fontWeight: 600 }}
            formatter={(value) => [formatIDR(Number(value)), t("revenue")]}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            name={t("revenue")}
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#rev)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function SalesByChannelChart({ data }: { data: ChannelStat[] }) {
  const t = useTranslations("salesReport");
  const rows = data.map((d) => ({
    ...d,
    label: CHANNEL_LABEL[d.channel] ?? d.channel,
  }));
  return (
    <ChartCard title={t("salesByChannel")} empty={rows.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            yAxisId="rev"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={54}
            tickFormatter={compactIDR}
          />
          <YAxis
            yAxisId="units"
            orientation="right"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={{ color: "var(--fg)", fontWeight: 600 }}
            formatter={(value, name) =>
              name === t("revenue")
                ? [formatIDR(Number(value)), name]
                : [String(value), name]
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            yAxisId="rev"
            dataKey="revenue"
            name={t("revenue")}
            fill="var(--accent)"
            radius={[3, 3, 0, 0]}
            maxBarSize={56}
          />
          <Line
            yAxisId="units"
            type="monotone"
            dataKey="units"
            name={t("units")}
            stroke="var(--success)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function SalesByCategoryChart({ data }: { data: CategoryStat[] }) {
  const t = useTranslations("salesReport");
  // Top 6 categories by revenue; fold the rest into "Other".
  const sorted = [...data].sort((a, b) => b.revenue - a.revenue);
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6);
  const slices = [...top.map((c) => ({ name: c.category, value: c.revenue }))];
  if (rest.length > 0) {
    slices.push({
      name: t("other"),
      value: rest.reduce((s, c) => s + c.revenue, 0),
    });
  }
  return (
    <ChartCard title={t("revenueByCategory")} empty={slices.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={92}
            paddingAngle={2}
            stroke="var(--surface)"
          >
            {slices.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value) => [formatIDR(Number(value)), t("revenue")]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function TopSkusChart({ data }: { data: SkuStat[] }) {
  const t = useTranslations("salesReport");
  return (
    <ChartCard title={t("topSkus")} empty={data.length === 0}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={compactIDR}
          />
          <YAxis
            type="category"
            dataKey="sku_code"
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={120}
          />
          <Tooltip
            cursor={{ fill: "var(--accent-dim)" }}
            contentStyle={tooltipStyle}
            labelStyle={{ color: "var(--fg)", fontWeight: 600 }}
            formatter={(value) => [formatIDR(Number(value)), t("revenue")]}
          />
          <Bar
            dataKey="revenue"
            name={t("revenue")}
            fill="var(--accent)"
            radius={[0, 3, 3, 0]}
            maxBarSize={22}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
