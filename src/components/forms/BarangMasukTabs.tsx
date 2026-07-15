"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useTranslations } from "next-intl";
import { PenLine, FileSpreadsheet } from "lucide-react";
import { StockInForm } from "@/components/forms/StockInForm";
import { PackingListImport } from "@/components/import/PackingListImport";
import { RecentMovements } from "@/components/movements/RecentMovements";
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
}: {
  skus: Opt[];
  locations: Loc[];
  recent: Movement[];
}) {
  const tf = useTranslations("form");
  const ti = useTranslations("import");

  return (
    <Tabs.Root defaultValue="manual">
      <Tabs.List className="mb-5 flex items-center gap-5 border-b border-border">
        <Tabs.Trigger value="manual" className={triggerCls}>
          <PenLine size={15} />
          {tf("manualEntry")}
        </Tabs.Trigger>
        <Tabs.Trigger value="packing" className={triggerCls}>
          <FileSpreadsheet size={15} />
          {ti("tabImport")}
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content
        value="manual"
        className="grid gap-6 focus:outline-none lg:grid-cols-2"
      >
        <StockInForm skus={skus} locations={locations} />
        <RecentMovements movements={recent} direction="in" />
      </Tabs.Content>
      <Tabs.Content value="packing" className="focus:outline-none">
        <PackingListImport skus={skus} locations={locations} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
