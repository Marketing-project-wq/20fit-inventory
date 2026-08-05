import { getTranslations } from "next-intl/server";
import { format } from "date-fns";
import {
  Package2,
  AlertTriangle,
  XCircle,
  ClipboardList,
  PackageX,
  ArrowDownToLine,
  ArrowUpFromLine,
  QrCode,
  ClipboardCheck,
  Info,
  Boxes,
  Wallet,
  TrendingUp,
  Percent,
  ArrowUp,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn, formatIDR } from "@/lib/utils";
import { getDashboard, getTrendMovements, getSalesReport } from "@/lib/data";
import {
  movementTrend,
  weekOfMonthTrend,
  salesAggregate,
  wibMonthRange,
} from "@/lib/reports";
import { StockBadge, MovementBadge, MOVEMENT_KEY } from "@/components/badges";
import { MovementTrendChart } from "@/components/dashboard/MovementTrendChart";
import { DashboardSalesChart } from "@/components/dashboard/DashboardSalesChart";

type Tone = "accent" | "warning" | "danger" | "success";
const toneText: Record<Tone, string> = {
  accent: "text-accent",
  warning: "text-warning",
  danger: "text-danger",
  success: "text-success",
};
const statusKey = { ok: "inStock", low: "lowStock", out: "outOfStock" } as const;

const num = new Intl.NumberFormat("id-ID");

// Month-over-month change indicator. `dir` drives the arrow + color;
// "none" (no prior-month data, or a flat value) shows neutral/gray, no arrow.
type Delta = { label: string; dir: "up" | "down" | "none" };

/** Percentage change vs last month. A non-positive base (no/zero last month, or
 *  a negative prior profit — where a % would mislead) yields a neutral delta. */
function pctDelta(cur: number, prev: number): Delta {
  if (prev <= 0) return { label: "", dir: "none" };
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.05) return { label: "0%", dir: "none" };
  return { label: `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`, dir: pct > 0 ? "up" : "down" };
}

/** Percentage-point change for margin (only meaningful when last month had sales). */
function ppDelta(cur: number, prev: number, hasPrev: boolean): Delta {
  if (!hasPrev) return { label: "", dir: "none" };
  const pp = cur - prev;
  if (Math.abs(pp) < 0.05) return { label: "0 pp", dir: "none" };
  return { label: `${pp > 0 ? "+" : ""}${pp.toFixed(1)} pp`, dir: pp > 0 ? "up" : "down" };
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const tp = await getTranslations("product");
  const ts = await getTranslations("stock");
  const tm = await getTranslations("movement");
  const tsr = await getTranslations("salesReport");

  // Sales performance uses the same getSalesReport + salesAggregate infra as the
  // Sales Report page: current WIB month (1st → today) vs the full previous month
  // for month-over-month deltas. Fetch both alongside the inventory data.
  const curMonth = wibMonthRange(0);
  const prevMonth = wibMonthRange(1);
  const [data, trendRows, curRows, prevRows] = await Promise.all([
    getDashboard(),
    getTrendMovements(),
    getSalesReport({ from: curMonth.from, to: curMonth.to }),
    getSalesReport({ from: prevMonth.from, to: prevMonth.to }),
  ]);
  const trendMonth = trendRows ? movementTrend(trendRows, "month") : [];
  const trendWeeks = trendRows ? weekOfMonthTrend(trendRows) : {};

  const curSales = curRows ? salesAggregate(curRows, curMonth.days) : null;
  const prevSales = prevRows ? salesAggregate(prevRows, prevMonth.days) : null;
  const cur = curSales?.summary;
  const prev = prevSales?.summary;
  const hasPrevSales = !!prev && prev.revenue > 0;

  const salesCards: {
    label: string;
    value: string;
    icon: LucideIcon;
    tone: string;
    delta: Delta;
  }[] = cur
    ? [
        {
          label: tsr("unitsSold"),
          value: num.format(cur.units),
          icon: Boxes,
          tone: "text-accent",
          delta: pctDelta(cur.units, prev?.units ?? 0),
        },
        {
          label: tsr("estRevenue"),
          value: formatIDR(cur.revenue),
          icon: Wallet,
          tone: "text-success",
          delta: pctDelta(cur.revenue, prev?.revenue ?? 0),
        },
        {
          label: tsr("estProfit"),
          value: formatIDR(cur.profit),
          icon: TrendingUp,
          tone: cur.profit >= 0 ? "text-success" : "text-danger",
          delta: pctDelta(cur.profit, prev?.profit ?? 0),
        },
        {
          label: tsr("grossMargin"),
          value: `${cur.marginPct.toFixed(1)}%`,
          icon: Percent,
          tone: "text-accent",
          delta: ppDelta(cur.marginPct, prev?.marginPct ?? 0, hasPrevSales),
        },
      ]
    : [];

  const kpis: { label: string; value: string; icon: LucideIcon; tone: Tone }[] = [
    {
      label: t("totalInventoryValue"),
      value: data ? formatIDR(data.totalInventoryValue) : "—",
      icon: Package2,
      tone: "accent",
    },
    {
      label: t("belowReorder"),
      value: data ? String(data.belowReorder) : "—",
      icon: AlertTriangle,
      tone: "warning",
    },
    {
      label: t("outOfStock"),
      value: data ? String(data.outOfStock) : "—",
      icon: XCircle,
      tone: "danger",
    },
    {
      label: t("openPurchaseOrders"),
      value: data ? String(data.openPurchaseOrders) : "—",
      icon: ClipboardList,
      tone: "success",
    },
    {
      label: t("damagedUnits"),
      value: data ? String(data.damagedUnits) : "—",
      icon: PackageX,
      tone: "danger",
    },
  ];

  const actions: { label: string; href: string; icon: LucideIcon }[] = [
    { label: t("receiveGoods"), href: "/barang-masuk", icon: ArrowDownToLine },
    { label: t("issueGoods"), href: "/barang-keluar", icon: ArrowUpFromLine },
    { label: t("scanQR"), href: "/scan", icon: QrCode },
    { label: t("startOpname"), href: "/stock-opname", icon: ClipboardCheck },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      {!data && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{t("connectNotice")}</p>
        </div>
      )}

      {/* KPI cards. The inventory-value card (index 0) holds a long IDR figure,
          so it spans two columns at every breakpoint (2-of-6 on xl) — that
          keeps the number on one line instead of breaking mid-figure. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={cn(
              "min-w-0 overflow-hidden rounded-xl border border-border bg-surface p-4 sm:p-5",
              i === 0 && "col-span-2 xl:col-span-2",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-muted">{k.label}</span>
              <k.icon size={18} className={cn("shrink-0", toneText[k.tone])} />
            </div>
            <div className="mt-3 truncate font-mono text-xl font-bold whitespace-nowrap text-fg sm:text-2xl">
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted">{t("quickActions")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border bg-surface p-4",
                "font-medium text-fg transition-colors hover:border-accent hover:bg-surface-2",
              )}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
                <a.icon size={20} className="text-accent" />
              </span>
              <span className="text-sm">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Sales performance (this month, estimated at catalog prices) */}
      {data && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-muted">
            {t("salesPerformance")}
          </h2>

          {/* Summary cards with month-over-month deltas */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {salesCards.map((c) => (
              <div
                key={c.label}
                className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface p-4 sm:p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-muted">{c.label}</span>
                  <c.icon size={18} className={cn("shrink-0", c.tone)} />
                </div>
                <div className="mt-3 truncate font-mono text-xl font-bold whitespace-nowrap text-fg sm:text-2xl">
                  {c.value}
                </div>
                {c.delta.label ? (
                  <div className="mt-1.5 flex items-center gap-1 text-xs font-medium">
                    {c.delta.dir === "up" && (
                      <ArrowUp size={13} className="shrink-0 text-success" />
                    )}
                    {c.delta.dir === "down" && (
                      <ArrowDown size={13} className="shrink-0 text-danger" />
                    )}
                    <span
                      className={cn(
                        c.delta.dir === "up"
                          ? "text-success"
                          : c.delta.dir === "down"
                            ? "text-danger"
                            : "text-dim",
                      )}
                    >
                      {c.delta.label}
                    </span>
                    <span className="font-normal text-dim">{t("vsLastMonth")}</span>
                  </div>
                ) : (
                  <div className="mt-1.5 text-xs text-dim">{t("noPriorData")}</div>
                )}
              </div>
            ))}
          </div>
          <p className="-mt-2 text-xs text-dim">{tsr("estimatedNote")}</p>

          {/* Daily sales trend + top 5 products */}
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <DashboardSalesChart series={curSales?.series ?? []} />
            </div>
            <div className="rounded-xl border border-border bg-surface p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold text-fg">{t("topProducts")}</h3>
              <div className="mt-4 overflow-hidden">
                {curSales && curSales.topSkus.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted">
                        <th className="pb-2 font-medium">{tp("skuCode")}</th>
                        <th className="pb-2 font-medium">{tp("productName")}</th>
                        <th className="pb-2 text-right font-medium">{tsr("units")}</th>
                        <th className="pb-2 text-right font-medium">{tsr("revenue")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {curSales.topSkus.slice(0, 5).map((s) => (
                        <tr key={s.sku_code} className="border-t border-border">
                          <td className="py-2">
                            <span className="sku text-xs">{s.sku_code}</span>
                          </td>
                          <td className="py-2 pr-2 text-muted">{s.product_name}</td>
                          <td className="py-2 text-right font-mono">
                            {num.format(s.units)}
                          </td>
                          <td className="py-2 pl-2 text-right font-mono whitespace-nowrap">
                            {formatIDR(s.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-10 text-sm text-muted">
                    {t("noSalesData")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activity trend */}
      {data && <MovementTrendChart month={trendMonth} weeksByMonth={trendWeeks} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Low-stock watchlist */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-fg">{t("lowStockWatchlist")}</h3>
          <div className="mt-4 overflow-hidden">
            {data && data.watchlist.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-2 font-medium">{tp("skuCode")}</th>
                    <th className="pb-2 font-medium">{tp("productName")}</th>
                    <th className="pb-2 text-right font-medium">{tp("stockOnHand")}</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.watchlist.map((s) => (
                    <tr key={s.variant_id} className="border-t border-border">
                      <td className="py-2">
                        <span className="sku text-xs">{s.sku_code}</span>
                      </td>
                      <td className="py-2 pr-2 text-muted">{s.product_name}</td>
                      <td className="py-2 text-right font-mono">{s.on_hand}</td>
                      <td className="py-2 pl-2 text-right">
                        <StockBadge status={s.status} label={ts(statusKey[s.status])} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-10 text-sm text-muted">
                {tc("noData")}
              </div>
            )}
          </div>
        </div>

        {/* Recent movements */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-fg">{t("recentMovements")}</h3>
          <div className="mt-4">
            {data && data.recent.length > 0 ? (
              <ul className="space-y-2">
                {data.recent.map((m) => (
                  <li
                    key={m.movement_id}
                    className="flex items-center gap-3 border-t border-border pt-2 text-sm first:border-0 first:pt-0"
                  >
                    <MovementBadge
                      type={m.movement_type}
                      label={tm(MOVEMENT_KEY[m.movement_type] ?? "sale")}
                    />
                    <span className="sku text-xs">{m.sku_code}</span>
                    <span className="ml-auto font-mono text-muted">{m.quantity}</span>
                    <span className="w-20 text-right text-xs text-dim">
                      {format(new Date(m.performed_at), "dd MMM")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-10 text-sm text-muted">
                {tc("noData")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
