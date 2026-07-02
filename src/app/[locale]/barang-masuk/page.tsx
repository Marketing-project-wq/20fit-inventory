import { getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { Info } from "lucide-react";
import { getSnapshot, getMovements } from "@/lib/data";
import { StockInForm } from "@/components/forms/StockInForm";
import { MovementBadge, MOVEMENT_KEY } from "@/components/badges";

export const dynamic = "force-dynamic";

const IN_TYPES = ["purchase_receipt", "adjustment_in", "transfer_in", "return_in"];

export default async function BarangMasukPage() {
  const t = await getTranslations("nav");
  const tf = await getTranslations("form");
  const tm = await getTranslations("movement");
  const tc = await getTranslations("common");
  const td = await getTranslations("dashboard");
  const snap = await getSnapshot();
  const recent =
    (await getMovements(250))
      ?.filter((m) => IN_TYPES.includes(m.movement_type))
      .slice(0, 12) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-fg">{t("goodsIn")}</h1>

      {!snap ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted">{tf("manualEntry")}</h2>
            <StockInForm skus={snap.skus} locations={snap.locations} />
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted">{tf("recentIn")}</h2>
            <div className="rounded-xl border border-border bg-surface p-4">
              {recent.length > 0 ? (
                <ul className="space-y-2">
                  {recent.map((m) => (
                    <li
                      key={m.movement_id}
                      className="flex items-center gap-3 border-t border-border pt-2 text-sm first:border-0 first:pt-0"
                    >
                      <MovementBadge
                        type={m.movement_type}
                        label={tm(MOVEMENT_KEY[m.movement_type] ?? "purchaseReceipt")}
                      />
                      <span className="sku text-xs">{m.sku_code}</span>
                      <span className="ml-auto font-mono text-success">+{m.quantity}</span>
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
