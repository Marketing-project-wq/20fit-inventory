import { getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { Info } from "lucide-react";
import { getSnapshot, getMovements } from "@/lib/data";
import { BarangKeluarTabs } from "@/components/forms/BarangKeluarTabs";
import { MovementBadge, MOVEMENT_KEY } from "@/components/badges";

export const dynamic = "force-dynamic";

const OUT_TYPES = ["sale", "adjustment_out", "transfer_out", "return_out", "write_off"];

const CHANNEL_LABEL: Record<string, string> = {
  offline: "Offline",
  tokopedia: "Tokopedia",
  shopee: "Shopee",
  b2b_direct: "B2B",
  other: "Other",
};

export default async function BarangKeluarPage() {
  const t = await getTranslations("nav");
  const tf = await getTranslations("form");
  const tm = await getTranslations("movement");
  const tc = await getTranslations("common");
  const td = await getTranslations("dashboard");
  const snap = await getSnapshot();
  const recent =
    (await getMovements(250))
      ?.filter((m) => OUT_TYPES.includes(m.movement_type))
      .slice(0, 12) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-fg">{t("goodsOut")}</h1>

      {!snap ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      ) : (
        <div className="space-y-8">
          <BarangKeluarTabs skus={snap.skus} locations={snap.locations} />
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted">{tf("recentOut")}</h2>
            <div className="max-w-2xl rounded-xl border border-border bg-surface p-4">
              {recent.length > 0 ? (
                <ul className="space-y-2">
                  {recent.map((m) => (
                    <li
                      key={m.movement_id}
                      className="flex items-center gap-3 border-t border-border pt-2 text-sm first:border-0 first:pt-0"
                    >
                      <MovementBadge
                        type={m.movement_type}
                        label={tm(MOVEMENT_KEY[m.movement_type] ?? "sale")}
                      />
                      <span className="sku text-xs">{m.sku_code}</span>
                      {m.sales_channel && (
                        <span className="text-xs text-dim">
                          {CHANNEL_LABEL[m.sales_channel] ?? m.sales_channel}
                        </span>
                      )}
                      <span className="ml-auto font-mono text-danger">-{m.quantity}</span>
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
