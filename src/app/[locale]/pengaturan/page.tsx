import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import {
  getSkuAdmin,
  getLocationsAdmin,
  getCategories,
  getBrands,
  getStaff,
  getCurrentStaff,
} from "@/lib/data";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { roleAtLeast } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function PengaturanPage() {
  const t = await getTranslations("nav");
  const ts = await getTranslations("settings");
  const td = await getTranslations("dashboard");

  const [skus, locations, categories, brands, staff, current] =
    await Promise.all([
      getSkuAdmin(),
      getLocationsAdmin(),
      getCategories(),
      getBrands(),
      getStaff(),
      getCurrentStaff(),
    ]);
  const canManageStaff = roleAtLeast(current.role, "admin");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t("settings")}</h1>
        <p className="mt-1 text-sm text-muted">{ts("subtitle")}</p>
      </div>

      {!skus || !locations ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      ) : (
        <SettingsTabs
          skus={skus}
          locations={locations}
          categories={categories.map((c) => ({ id: c.category_id, name: c.name }))}
          brands={brands.map((b) => ({ id: b.brand_id, name: b.name }))}
          staff={staff ?? []}
          canManageStaff={canManageStaff}
          email={current.email}
          nickname={current.nickname}
          role={current.role}
        />
      )}
    </div>
  );
}
