import { getTranslations } from "next-intl/server";
import { Construction } from "lucide-react";
import type { NavItem } from "@/components/layout/nav-items";

/** Shared "under construction" screen for routes not yet implemented. */
export async function PagePlaceholder({
  titleKey,
}: {
  titleKey: NavItem["key"];
}) {
  const t = await getTranslations("nav");
  const tc = await getTranslations("common");

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-fg">{t(titleKey)}</h1>
      <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-dim">
          <Construction className="text-accent" size={26} />
        </div>
        <p className="mt-3 text-sm font-medium text-fg">{tc("comingSoon")}</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          {tc("underConstruction")}
        </p>
      </div>
    </div>
  );
}
