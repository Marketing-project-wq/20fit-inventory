import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { getSnapshot } from "@/lib/data";
import { formatIDR } from "@/lib/utils";
import { StockBadge } from "@/components/badges";
import { QRCodeCell } from "@/components/products/QRCodeCell";

const statusKey = { ok: "inStock", low: "lowStock", out: "outOfStock" } as const;

export const dynamic = "force-dynamic";

export default async function ProdukPage() {
  const t = await getTranslations("nav");
  const tp = await getTranslations("product");
  const ts = await getTranslations("stock");
  const tc = await getTranslations("common");
  const td = await getTranslations("dashboard");
  const snap = await getSnapshot();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t("products")}</h1>
        {snap && (
          <p className="mt-1 text-sm text-muted">{snap.skus.length} SKU</p>
        )}
      </div>

      {!snap ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[840px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">QR</th>
                <th className="px-4 py-3 font-medium">{tp("skuCode")}</th>
                <th className="px-4 py-3 font-medium">{tp("productName")}</th>
                <th className="px-4 py-3 font-medium">{tp("brand")}</th>
                <th className="px-4 py-3 font-medium">{tp("category")}</th>
                <th className="px-4 py-3 text-right font-medium">{tp("costPrice")}</th>
                <th className="px-4 py-3 text-right font-medium">{tp("sellingPrice")}</th>
                <th className="px-4 py-3 text-right font-medium">{tp("stockOnHand")}</th>
                <th className="px-4 py-3 font-medium">{tc("status")}</th>
              </tr>
            </thead>
            <tbody>
              {snap.skus.map((s) => (
                <tr
                  key={s.variant_id}
                  className="border-b border-border last:border-0 hover:bg-surface-2"
                >
                  <td className="px-4 py-3">
                    <QRCodeCell sku={s.sku_code} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="sku">{s.sku_code}</span>
                  </td>
                  <td className="px-4 py-3 text-fg">{s.product_name}</td>
                  <td className="px-4 py-3 text-muted">{s.brand ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{s.category ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted">
                    {s.cost_price != null ? formatIDR(s.cost_price) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {s.selling_price != null ? formatIDR(s.selling_price) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{s.on_hand}</td>
                  <td className="px-4 py-3">
                    <StockBadge status={s.status} label={ts(statusKey[s.status])} />
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
