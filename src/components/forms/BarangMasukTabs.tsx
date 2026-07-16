"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useTranslations } from "next-intl";
import { PenLine, FileSpreadsheet, FileText } from "lucide-react";
import { GoodsInManual } from "@/components/goods-in/GoodsInManual";
import { PackingListImport } from "@/components/import/PackingListImport";
import { CentrSoImport } from "@/components/import/CentrSoImport";
import type { Movement } from "@/lib/data";
import { cn } from "@/lib/utils";

type Opt = {
  variant_id: string;
  sku_code: string;
  product_name: string;
  cost_price?: number | null;
};
type Loc = { location_id: string; name: string };

const triggerCls = cn(
  "inline-flex items-center gap-2 border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
  "border-transparent text-muted hover:text-fg",
  "data-[state=active]:border-accent data-[state=active]:text-fg",
);

export function BarangMasukTabs({
  skus,
  locations,
  recent,
  preselectVariantId,
}: {
  skus: Opt[];
  locations: Loc[];
  recent: Movement[];
  preselectVariantId?: string;
}) {
  const tf = useTranslations("form");
  const ti = useTranslations("import");
  const tcentr = useTranslations("centr");

  return (
    <Tabs.Root defaultValue="manual">
      <Tabs.List className="mb-5 flex flex-wrap items-center gap-5 border-b border-border">
        <Tabs.Trigger value="manual" className={triggerCls}>
          <PenLine size={15} />
          {tf("manualEntry")}
        </Tabs.Trigger>
        <Tabs.Trigger value="packing" className={triggerCls}>
          <FileSpreadsheet size={15} />
          {ti("tabImport")}
        </Tabs.Trigger>
        <Tabs.Trigger value="centr" className={triggerCls}>
          <FileText size={15} />
          {tcentr("tab")}
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="manual" className="focus:outline-none">
        <GoodsInManual
          skus={skus}
          locations={locations}
          recent={recent}
          preselectVariantId={preselectVariantId}
        />
      </Tabs.Content>
      <Tabs.Content value="packing" className="focus:outline-none">
        <PackingListImport skus={skus} locations={locations} />
      </Tabs.Content>
      <Tabs.Content value="centr" className="focus:outline-none">
        <CentrSoImport skus={skus} locations={locations} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
