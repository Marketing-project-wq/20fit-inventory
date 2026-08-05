import { getTranslations } from "next-intl/server";
import { Info, Boxes, Wallet, TrendingUp, Percent, type LucideIcon } from "lucide-react";
import { getSalesReport, getCategories } from "@/lib/data";
import { resolveSalesPeriod, salesAggregate } from "@/lib/reports";
import { formatIDR } from "@/lib/utils";
import { SalesFilterBar } from "@/components/sales/SalesFilterBar";
import {
  SalesTrendChart,
  SalesByChannelChart,
  SalesByCategoryChart,
  TopSkusChart,
} from "@/components/sales/SalesCharts";

export const dynamic = "force-dynamic";

// Known sales channels (free-text column, UI-constrained). Display labels are
// proper nouns, so they are not translated.
const CHANNELS = [
  { value: "b2b_direct", label: "B2B Direct" },
  { value: "offline", label: "Offline" },
  { value: "tokopedia", label: "Tokopedia" },
  { value: "shopee", label: "Shopee" },
];

const num = new Intl.NumberFormat("id-ID");

export default async function SalesReportPage({
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    channel?: string;
    category?: string;
  }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("salesReport");
  const tdash = await getTranslations("dashboard");

  const preset = sp.preset ?? "month";
  const period = resolveSalesPeriod(preset, sp.from, sp.to);

  const [rows, categories] = await Promise.all([
    getSalesReport({
      from: period.from,
      to: period.to,
      channel: sp.channel || undefined,
      category: sp.category || undefined,
    }),
    getCategories(),
  ]);

  const header = (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-fg">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
    </div>
  );

  if (!rows) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{tdash("connectNotice")}</p>
        </div>
      </div>
    );
  }

  const report = salesAggregate(rows, period.days);
  const { summary } = report;

  const cards: { label: string; value: string; icon: LucideIcon; tone: string }[] = [
    {
      label: t("unitsSold"),
      value: num.format(summary.units),
      icon: Boxes,
      tone: "text-accent",
    },
    {
      label: t("estRevenue"),
      value: formatIDR(summary.revenue),
      icon: Wallet,
      tone: "text-success",
    },
    {
      label: t("estProfit"),
      value: formatIDR(summary.profit),
      icon: TrendingUp,
      tone: summary.profit >= 0 ? "text-success" : "text-danger",
    },
    {
      label: t("grossMargin"),
      value: `${summary.marginPct.toFixed(1)}%`,
      icon: Percent,
      tone: "text-accent",
    },
  ];

  return (
    <div className="space-y-6">
      {header}

      <SalesFilterBar
        preset={preset}
        from={period.from}
        to={period.to}
        channel={sp.channel ?? ""}
        category={sp.category ?? ""}
        channels={CHANNELS}
        categories={categories.map((c) => ({ value: c.category_id, label: c.name }))}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface p-4 sm:p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-muted">{c.label}</span>
              <c.icon size={18} className={`shrink-0 ${c.tone}`} />
            </div>
            <div className="mt-3 truncate whitespace-nowrap font-mono text-xl font-bold text-fg sm:text-2xl">
              {c.value}
            </div>
          </div>
        ))}
      </div>
      <p className="-mt-3 text-xs text-dim">{t("estimatedNote")}</p>

      {/* Charts */}
      <SalesTrendChart series={report.series} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SalesByChannelChart data={report.byChannel} />
        <SalesByCategoryChart data={report.byCategory} />
      </div>
      <TopSkusChart data={report.topSkus} />
    </div>
  );
}
