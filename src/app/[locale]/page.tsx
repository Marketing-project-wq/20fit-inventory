import { getTranslations } from "next-intl/server";
import {
  Package2,
  AlertTriangle,
  XCircle,
  ClipboardList,
  ArrowDownToLine,
  ArrowUpFromLine,
  QrCode,
  ClipboardCheck,
  Info,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Tone = "accent" | "warning" | "danger" | "success";

const toneText: Record<Tone, string> = {
  accent: "text-accent",
  warning: "text-warning",
  danger: "text-danger",
  success: "text-success",
};

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");

  const kpis: { label: string; value: string; icon: LucideIcon; tone: Tone }[] = [
    { label: t("totalInventoryValue"), value: "—", icon: Package2, tone: "accent" },
    { label: t("belowReorder"), value: "—", icon: AlertTriangle, tone: "warning" },
    { label: t("outOfStock"), value: "—", icon: XCircle, tone: "danger" },
    { label: t("openPurchaseOrders"), value: "—", icon: ClipboardList, tone: "success" },
  ];

  const actions: { label: string; href: string; icon: LucideIcon }[] = [
    { label: t("receiveGoods"), href: "/barang-masuk", icon: ArrowDownToLine },
    { label: t("issueGoods"), href: "/barang-keluar", icon: ArrowUpFromLine },
    { label: t("scanQR"), href: "/produk", icon: QrCode },
    { label: t("startOpname"), href: "/stock-opname", icon: ClipboardCheck },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      {/* Notice: data pending Supabase connection */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
        <Info className="mt-0.5 shrink-0 text-accent" size={18} />
        <p className="text-sm text-fg/90">{t("connectNotice")}</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">{k.label}</span>
              <k.icon size={18} className={toneText[k.tone]} />
            </div>
            <div className="mt-3 font-mono text-3xl font-bold text-fg">
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted">
          {t("quickActions")}
        </h2>
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

      {/* Watchlist + recent movements (empty states for now) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[t("lowStockWatchlist"), t("recentMovements")].map((title) => (
          <div
            key={title}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <h3 className="text-sm font-semibold text-fg">{title}</h3>
            <div className="mt-4 flex items-center justify-center rounded-lg border border-dashed border-border py-10 text-sm text-muted">
              {tc("noData")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
