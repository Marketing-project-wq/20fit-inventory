"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useTranslations } from "next-intl";
import { PenLine, ReceiptText, Wrench } from "lucide-react";
import { GoodsOutManual } from "@/components/goods-out/GoodsOutManual";
import { WarrantyClaimsTable } from "@/components/goods-out/WarrantyClaimsTable";
import { XeroImportPanel } from "@/components/import/XeroImportPanel";
import type { StockByLoc } from "@/components/goods-out/WarrantyOutForm";
import type { Movement, WarrantyClaim } from "@/lib/data";
import { cn } from "@/lib/utils";

type Opt = { variant_id: string; sku_code: string; product_name: string };
type Loc = { location_id: string; name: string };

const triggerCls = cn(
  "inline-flex items-center gap-2 border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
  "border-transparent text-muted hover:text-fg",
  "data-[state=active]:border-accent data-[state=active]:text-fg",
);

export function BarangKeluarTabs({
  skus,
  locations,
  recent,
  stockByLoc,
  claims,
  preselectVariantId,
}: {
  skus: Opt[];
  locations: Loc[];
  recent: Movement[];
  stockByLoc: StockByLoc[];
  claims: WarrantyClaim[];
  preselectVariantId?: string;
}) {
  const tf = useTranslations("form");
  const tx = useTranslations("xero");
  const tg = useTranslations("goodsOut");

  return (
    <Tabs.Root defaultValue="manual">
      <Tabs.List className="mb-5 flex flex-wrap gap-5 border-b border-border">
        <Tabs.Trigger value="manual" className={triggerCls}>
          <PenLine size={15} />
          {tf("manualEntry")}
        </Tabs.Trigger>
        <Tabs.Trigger value="warranty" className={triggerCls}>
          <Wrench size={15} />
          {tg("claimsTab")}
        </Tabs.Trigger>
        <Tabs.Trigger value="xero" className={triggerCls}>
          <ReceiptText size={15} />
          {tx("tabImport")}
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="manual" className="focus:outline-none">
        <GoodsOutManual
          skus={skus}
          locations={locations}
          recent={recent}
          stockByLoc={stockByLoc}
          preselectVariantId={preselectVariantId}
        />
      </Tabs.Content>
      <Tabs.Content value="warranty" className="focus:outline-none">
        <WarrantyClaimsTable claims={claims} />
      </Tabs.Content>
      <Tabs.Content value="xero" className="focus:outline-none">
        <XeroImportPanel skus={skus} locations={locations} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
