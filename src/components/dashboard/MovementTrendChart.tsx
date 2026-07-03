"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { inputCls } from "@/components/forms/ui";
import type { TrendPoint } from "@/lib/reports";

export function MovementTrendChart({
  month,
  weeksByMonth,
}: {
  month: TrendPoint[];
  weeksByMonth: Record<string, TrendPoint[]>;
}) {
  const t = useTranslations("dashboard");
  const ts = useTranslations("stock");
  const tc = useTranslations("common");
  const [gran, setGran] = useState<"week" | "month">("month");
  const months = month.map((m) => ({ value: m.period, label: m.label }));
  const [selMonth, setSelMonth] = useState(
    months[months.length - 1]?.value ?? "",
  );

  const data =
    gran === "week"
      ? (weeksByMonth[selMonth] ?? []).map((p) => ({
          ...p,
          label: `${t("week")} ${p.label}`,
        }))
      : month;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg">{t("activityTrend")}</h3>
        <div className="flex items-center gap-2">
          {gran === "week" && months.length > 0 && (
            <select
              value={selMonth}
              onChange={(e) => setSelMonth(e.target.value)}
              aria-label={t("perMonth")}
              className={cn(inputCls, "w-auto py-1.5 text-xs")}
            >
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          <div className="flex items-center overflow-hidden rounded-lg border border-border text-xs font-semibold">
            {(["week", "month"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGran(g)}
                className={cn(
                  "px-3 py-1.5 transition-colors",
                  gran === g ? "bg-accent text-bg" : "text-muted hover:text-fg",
                )}
                aria-pressed={gran === g}
              >
                {g === "week" ? t("perWeek") : t("perMonth")}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="h-[280px] w-full">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            {tc("noData")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
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
                width={46}
              />
              <Tooltip
                cursor={{ fill: "var(--accent-dim)" }}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--fg)", fontWeight: 600 }}
                itemStyle={{ color: "var(--muted)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="masuk"
                name={ts("goodsIn")}
                fill="var(--success)"
                radius={[3, 3, 0, 0]}
                maxBarSize={40}
              />
              <Bar
                dataKey="keluar"
                name={ts("goodsOut")}
                fill="var(--accent)"
                radius={[3, 3, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
