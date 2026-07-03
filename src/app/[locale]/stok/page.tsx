import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { getSnapshot } from "@/lib/data";
import { StockTable } from "@/components/stock/StockTable";

export const dynamic = "force-dynamic";

export default async function StokPage() {
  const t = await getTranslations("nav");
  const td = await getTranslations("dashboard");
  const snap = await getSnapshot();
  const rows = snap?.stockRows ?? [];

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
        <StockTable rows={rows} />
      )}
    </div>
  );
}
