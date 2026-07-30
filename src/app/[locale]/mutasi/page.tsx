import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { getMovements } from "@/lib/data";
import { MovementTable } from "@/components/movements/MovementTable";
import { MovementUserFilter } from "@/components/movements/MovementUserFilter";

export const dynamic = "force-dynamic";

export default async function MutasiPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const sp = await searchParams;
  const userFilter = sp.user?.trim() || "";

  const t = await getTranslations("nav");
  const td = await getTranslations("dashboard");
  const movements = await getMovements(150, { user: userFilter || undefined });

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
        <>
          <MovementUserFilter value={userFilter} />
          <MovementTable movements={movements} />
        </>
      )}
    </div>
  );
}
