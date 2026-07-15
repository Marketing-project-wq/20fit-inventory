import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { getSnapshot, getCategories, getBrands } from "@/lib/data";
import { ProductTable } from "@/components/products/ProductTable";
import { AddSkuButton } from "@/components/products/AddSkuButton";

export const dynamic = "force-dynamic";

export default async function ProdukPage() {
  const t = await getTranslations("nav");
  const td = await getTranslations("dashboard");
  const [snap, categories, brands] = await Promise.all([
    getSnapshot(),
    getCategories(),
    getBrands(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">{t("products")}</h1>
          {snap && <p className="mt-1 text-sm text-muted">{snap.skus.length} SKU</p>}
        </div>
        {snap && (
          <AddSkuButton
            categories={categories.map((c) => ({ id: c.category_id, name: c.name }))}
            brands={brands.map((b) => ({ id: b.brand_id, name: b.name }))}
            existingSkus={snap.skus.map((s) => s.sku_code)}
          />
        )}
      </div>

      {!snap ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      ) : (
        <ProductTable skus={snap.skus} />
      )}
    </div>
  );
}
