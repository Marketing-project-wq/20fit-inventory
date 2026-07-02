import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { getSnapshot } from "@/lib/data";
import { XeroQuotationImport } from "@/components/import/XeroQuotationImport";

export const dynamic = "force-dynamic";

export default async function ImportXeroPage() {
  const t = await getTranslations("import");
  const td = await getTranslations("dashboard");
  const snap = await getSnapshot();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t("xeroTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("xeroPageSubtitle")}</p>
      </div>

      {!snap ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      ) : (
        <XeroQuotationImport
          skus={snap.skus.map((s) => ({
            variant_id: s.variant_id,
            sku_code: s.sku_code,
            product_name: s.product_name,
            cost_price: s.cost_price,
            selling_price: s.selling_price,
          }))}
        />
      )}
    </div>
  );
}
