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
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn, formatIDR } from "@/lib/utils";
import { getDashboard, getTrendMovements } from "@/lib/data";
import { movementTrend, weekOfMonthTrend } from "@/lib/reports";
import { StockBadge, MovementBadge, MOVEMENT_KEY } from "@/components/badges";
import { MovementTrendChart } from "@/components/dashboard/MovementTrendChart";

type Tone = "accent" | "warning" | "danger" | "success";
const toneText: Record<Tone, string> = {
  accent: "text-accent",
  warning: "text-warning",
  danger: "text-danger",
  success: "text-success",
};
const statusKey = { ok: "inStock", low: "lowStock", out: "outOfStock" } as const;

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const tp = await getTranslations("product");
  const ts = await getTranslations("stock");
  const tm = await getTranslations("movement");

  const data = await getDashboard();
  const trendRows = await getTrendMovements();
  const trendMonth = trendRows ? movementTrend(trendRows, "month") : [];
  const trendWeeks = trendRows ? weekOfMonthTrend(trendRows) : {};

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
          so it spans both mobile columns to avoid clipping. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={cn(
              "rounded-xl border border-border bg-surface p-4 sm:p-5",
              i === 0 && "col-span-2 xl:col-span-1",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted">{k.label}</span>
              <k.icon size={18} className={cn("shrink-0", toneText[k.tone])} />
            </div>
            <div className="mt-3 font-mono text-xl font-bold break-words text-fg sm:text-2xl">
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
