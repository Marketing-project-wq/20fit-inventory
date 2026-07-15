import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { getSnapshot, getMovements, getWarrantyClaims } from "@/lib/data";
import { BarangKeluarTabs } from "@/components/forms/BarangKeluarTabs";

export const dynamic = "force-dynamic";

const OUT_TYPES = [
  "sale",
  "adjustment_out",
  "transfer_out",
  "return_out",
  "write_off",
  "damage_out",
  "warranty_out",
];

export default async function BarangKeluarPage() {
  const t = await getTranslations("nav");
  const td = await getTranslations("dashboard");
  const snap = await getSnapshot();
  const recent =
    (await getMovements(250))
      ?.filter((m) => OUT_TYPES.includes(m.movement_type))
      .slice(0, 12) ?? [];
  const claims = snap ? ((await getWarrantyClaims()) ?? []) : [];

  // Per-location good/damaged stock, so the manual forms can show availability
  // and cap quantities against the right pool.
  const stockByLoc =
    snap?.stockRows.map((r) => ({
      variant_id: r.variant_id,
      location_id: r.location_id,
      good: r.on_hand,
      damaged: r.damaged,
    })) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-fg">{t("goodsOut")}</h1>

      {!snap ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      ) : (
        <BarangKeluarTabs
          skus={snap.skus}
          locations={snap.locations}
          recent={recent}
          stockByLoc={stockByLoc}
          claims={claims}
        />
      )}
    </div>
  );
}
