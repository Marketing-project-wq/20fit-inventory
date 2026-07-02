import { getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { Info } from "lucide-react";
import { getMovements } from "@/lib/data";
import { MovementBadge, MOVEMENT_KEY } from "@/components/badges";

const CHANNEL_LABEL: Record<string, string> = {
  offline: "Offline",
  tokopedia: "Tokopedia",
  shopee: "Shopee",
  b2b_direct: "B2B",
  other: "Other",
};

export const dynamic = "force-dynamic";

export default async function MutasiPage() {
  const t = await getTranslations("nav");
  const tp = await getTranslations("product");
  const tc = await getTranslations("common");
  const tm = await getTranslations("movement");
  const td = await getTranslations("dashboard");
  const movements = await getMovements(150);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t("movements")}</h1>
        {movements && (
          <p className="mt-1 text-sm text-muted">{movements.length} {t("movements").toLowerCase()}</p>
        )}
      </div>

      {!movements ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">{tc("date")}</th>
                <th className="px-4 py-3 font-medium">{tc("type")}</th>
                <th className="px-4 py-3 font-medium">{tp("skuCode")}</th>
                <th className="px-4 py-3 font-medium">{tp("productName")}</th>
                <th className="px-4 py-3 text-right font-medium">{tc("quantity")}</th>
                <th className="px-4 py-3 font-medium">{tc("channel")}</th>
                <th className="px-4 py-3 font-medium">{tc("notes")}</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr
                  key={m.movement_id}
                  className="border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                    {format(new Date(m.performed_at), "dd MMM yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <MovementBadge
                      type={m.movement_type}
                      label={tm(MOVEMENT_KEY[m.movement_type] ?? "sale")}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="sku">{m.sku_code}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{m.product_name}</td>
                  <td className="px-4 py-3 text-right font-mono">{m.quantity}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {m.sales_channel ? (CHANNEL_LABEL[m.sales_channel] ?? m.sales_channel) : "—"}
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-xs text-dim">
                    {m.notes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
