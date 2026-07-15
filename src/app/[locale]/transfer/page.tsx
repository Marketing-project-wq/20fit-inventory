import { getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { Info, ArrowRight } from "lucide-react";
import { getSnapshot, getSalesStaff, getRecentTransfers } from "@/lib/data";
import { TransferForm } from "@/components/forms/TransferForm";
import { PhotoThumb } from "@/components/ui/PhotoThumb";

export const dynamic = "force-dynamic";

export default async function TransferPage() {
  const t = await getTranslations("nav");
  const tf = await getTranslations("form");
  const tc = await getTranslations("common");
  const td = await getTranslations("dashboard");
  const snap = await getSnapshot();
  const [salesStaff, recent] = await Promise.all([
    getSalesStaff(),
    getRecentTransfers(12),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-fg">{t("transfer")}</h1>

      {!snap ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted">{tf("manualEntry")}</h2>
            <TransferForm
              skus={snap.skus}
              locations={snap.locations}
              salesStaff={salesStaff}
            />
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted">{tf("recentTransfers")}</h2>
            <div className="rounded-xl border border-border bg-surface p-4">
              {recent.length > 0 ? (
                <ul className="space-y-2">
                  {recent.map((m) => (
                    <li
                      key={m.movement_id}
                      className="flex items-center gap-2 border-t border-border pt-2 text-sm first:border-0 first:pt-0"
                    >
                      <ArrowRight size={14} className="shrink-0 text-accent" />
                      <span className="sku text-xs">{m.sku_code}</span>
                      {(m.sales_staff_name || m.dw_name) && (
                        <span className="truncate text-xs text-muted">
                          {m.sales_staff_name ?? `DW: ${m.dw_name}`}
                        </span>
                      )}
                      {m.photo_url && (
                        <PhotoThumb url={m.photo_url} alt={tf("recentTransfers")} />
                      )}
                      <span className="ml-auto font-mono text-muted">{m.quantity}</span>
                      <span className="w-16 text-right text-xs text-dim">
                        {format(new Date(m.performed_at), "dd MMM")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-8 text-center text-sm text-muted">{tc("noData")}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
