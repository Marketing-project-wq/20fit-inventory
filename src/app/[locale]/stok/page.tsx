import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { getSnapshot } from "@/lib/data";
import { StockBadge } from "@/components/badges";

const statusKey = { ok: "inStock", low: "lowStock", out: "outOfStock" } as const;

export const dynamic = "force-dynamic";

export default async function StokPage() {
  const t = await getTranslations("nav");
  const tp = await getTranslations("product");
  const ts = await getTranslations("stock");
  const tc = await getTranslations("common");
  const td = await getTranslations("dashboard");
  const snap = await getSnapshot();

  const rows = snap
    ? [...snap.stockRows].sort(
        (a, b) =>
          a.location_name.localeCompare(b.location_name) ||
          a.product_name.localeCompare(b.product_name),
      )
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t("stock")}</h1>
        {snap && (
          <p className="mt-1 text-sm text-muted">
            {rows.length} × {snap.locations.length}{" "}
            {snap.locations.map((l) => l.name).join(" · ")}
          </p>
        )}
      </div>

      {!snap ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">{tp("skuCode")}</th>
                <th className="px-4 py-3 font-medium">{tp("productName")}</th>
                <th className="px-4 py-3 font-medium">{tc("location")}</th>
                <th className="px-4 py-3 text-right font-medium">{tp("stockOnHand")}</th>
                <th className="px-4 py-3 text-right font-medium">{tc("reserved")}</th>
                <th className="px-4 py-3 text-right font-medium">{tc("available")}</th>
                <th className="px-4 py-3 font-medium">{tc("status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.variant_id}-${r.location_id}`}
                  className="border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    <span className="sku">{r.sku_code}</span>
                  </td>
                  <td className="px-4 py-3 text-fg">{r.product_name}</td>
                  <td className="px-4 py-3 text-muted">{r.location_name}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.on_hand}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted">{r.reserved}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.available}</td>
                  <td className="px-4 py-3">
                    <StockBadge status={r.status} label={ts(statusKey[r.status])} />
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
