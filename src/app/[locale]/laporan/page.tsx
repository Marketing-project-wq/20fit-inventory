import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { getReportSource } from "@/lib/data";
import {
  valuationByCategory,
  monthlyRecap,
  deadStock,
  movers,
  monthsWithData,
} from "@/lib/reports";
import { formatIDR, cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { MonthSelect } from "@/components/reports/MonthSelect";
import { ExportCsvButton } from "@/components/reports/ExportCsvButton";

export const dynamic = "force-dynamic";

const TABS = ["monthly", "valuation", "dead", "movers"] as const;
type Tab = (typeof TABS)[number];
const DEAD_DAYS = 90;
const MOVER_DAYS = 90;

const th = "px-4 py-3 text-left font-medium";
const thr = "px-4 py-3 text-right font-medium";
const td = "px-4 py-2";
const tdr = "px-4 py-2 text-right font-mono";

export default async function LaporanPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab)
    : "monthly";

  const t = await getTranslations("nav");
  const tr = await getTranslations("report");
  const tp = await getTranslations("product");
  const tc = await getTranslations("common");
  const tdash = await getTranslations("dashboard");

  const source = await getReportSource();

  if (!source) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t("reports")}</h1>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{tdash("connectNotice")}</p>
        </div>
      </div>
    );
  }

  const months = monthsWithData(source.movements);
  const defaultMonth = months[months.length - 1] ?? new Date().toISOString().slice(0, 7);
  const month =
    sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : defaultMonth;
  const [year, mo] = month.split("-").map(Number);
  const nowMs = Date.now();

  const tabHref = (x: Tab) => `/laporan?tab=${x}&month=${month}`;
  const tabs: { id: Tab; label: string }[] = [
    { id: "monthly", label: tr("monthly") },
    { id: "valuation", label: tr("valuation") },
    { id: "dead", label: tr("deadStock") },
    { id: "movers", label: tr("movers") },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-fg">{t("reports")}</h1>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((x) => (
          <Link
            key={x.id}
            href={tabHref(x.id)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === x.id
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-fg",
            )}
          >
            {x.label}
          </Link>
        ))}
      </div>

      {tab === "monthly" && (
        <MonthlyReport
          rows={monthlyRecap(source.skus, source.movements, year, mo)}
          months={months}
          month={month}
          labels={{ tp, tr, tc }}
        />
      )}
      {tab === "valuation" && (
        <ValuationReport
          data={valuationByCategory(source.skus)}
          labels={{ tr, tc, tp }}
        />
      )}
      {tab === "dead" && (
        <DeadStockReport
          rows={deadStock(source.skus, source.movements, DEAD_DAYS, nowMs)}
          days={DEAD_DAYS}
          labels={{ tp, tr, tc }}
        />
      )}
      {tab === "movers" && (
        <MoversReport
          data={movers(source.skus, source.movements, MOVER_DAYS, nowMs)}
          days={MOVER_DAYS}
          labels={{ tp, tr }}
        />
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      {children}
    </div>
  );
}

function MonthlyReport({ rows, months, month, labels }: any) {
  const { tp, tr, tc } = labels;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSelect months={months} value={month} />
        <ExportCsvButton
          rows={rows}
          filename={`rekap-bulanan-${month}.csv`}
          label={tc("export")}
        />
      </div>
      <Card>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className={th}>{tp("skuCode")}</th>
              <th className={th}>{tp("productName")}</th>
              <th className={thr}>{tr("opening")}</th>
              <th className={thr}>{tr("in")}</th>
              <th className={thr}>{tr("outOffline")}</th>
              <th className={thr}>{tr("outOnline")}</th>
              <th className={thr}>B2B</th>
              <th className={thr}>{tr("closing")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-sm text-muted">
                  {tc("noData")}
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.sku_code} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className={td}><span className="sku">{r.sku_code}</span></td>
                <td className={`${td} text-muted`}>{r.product_name}</td>
                <td className={tdr}>{r.opening}</td>
                <td className={`${tdr} text-success`}>{r.goods_in || "—"}</td>
                <td className={tdr}>{r.offline || "—"}</td>
                <td className={tdr}>{r.online || "—"}</td>
                <td className={tdr}>{r.b2b || "—"}</td>
                <td className={`${tdr} font-semibold`}>{r.closing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ValuationReport({ data, labels }: any) {
  const { tr, tc, tp } = labels;
  const { rows, total } = data;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted">
          {tr("totalAtCost")}:{" "}
          <span className="font-mono font-semibold text-accent">{formatIDR(total.cost)}</span>
        </div>
        <ExportCsvButton rows={rows} filename="valuasi.csv" label={tc("export")} />
      </div>
      <Card>
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className={th}>{tp("category")}</th>
              <th className={thr}>SKU</th>
              <th className={thr}>{tr("units")}</th>
              <th className={thr}>{tr("valueCost")}</th>
              <th className={thr}>{tr("valueRetail")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.category} className="border-b border-border hover:bg-surface-2">
                <td className={`${td} text-fg`}>{r.category}</td>
                <td className={tdr}>{r.skus}</td>
                <td className={tdr}>{r.units}</td>
                <td className={tdr}>{formatIDR(r.cost)}</td>
                <td className={`${tdr} text-muted`}>{formatIDR(r.retail)}</td>
              </tr>
            ))}
            <tr className="bg-surface-2 font-semibold">
              <td className={td}>{tr("total")}</td>
              <td className={tdr}>—</td>
              <td className={tdr}>{total.units}</td>
              <td className={`${tdr} text-accent`}>{formatIDR(total.cost)}</td>
              <td className={tdr}>{formatIDR(total.retail)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function DeadStockReport({ rows, days, labels }: any) {
  const { tp, tr, tc } = labels;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{tr("deadHint", { days })}</p>
        <ExportCsvButton rows={rows} filename={`dead-stock-${days}d.csv`} label={tc("export")} />
      </div>
      <Card>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className={th}>{tp("skuCode")}</th>
              <th className={th}>{tp("productName")}</th>
              <th className={thr}>{tp("stockOnHand")}</th>
              <th className={thr}>{tr("lastMoved")}</th>
              <th className={thr}>{tr("valueCost")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-muted">
                  {tr("noDead")}
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.sku_code} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className={td}><span className="sku">{r.sku_code}</span></td>
                <td className={`${td} text-muted`}>{r.product_name}</td>
                <td className={tdr}>{r.on_hand}</td>
                <td className={`${tdr} text-dim`}>{r.last_moved ?? "—"}</td>
                <td className={tdr}>{formatIDR(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function MoversReport({ data, days, labels }: any) {
  const { tp, tr } = labels;
  const table = (title: string, rows: any[]) => (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-fg">{title}</h3>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className={th}>{tp("skuCode")}</th>
              <th className={th}>{tp("productName")}</th>
              <th className={thr}>{tr("sold")}</th>
              <th className={thr}>{tp("stockOnHand")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.sku_code} className="border-b border-border last:border-0">
                <td className={td}><span className="sku">{r.sku_code}</span></td>
                <td className={`${td} text-muted`}>{r.product_name}</td>
                <td className={`${tdr} font-semibold`}>{r.sold}</td>
                <td className={`${tdr} text-muted`}>{r.on_hand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{tr("moversHint", { days })}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        {table(tr("fastMovers"), data.fast)}
        {table(tr("slowMovers"), data.slow)}
      </div>
    </div>
  );
}
