"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useTranslations } from "next-intl";
import { PenLine, ReceiptText } from "lucide-react";
import { StockOutForm } from "@/components/forms/StockOutForm";
import { XeroImportPanel } from "@/components/import/XeroImportPanel";
import { RecentMovements } from "@/components/movements/RecentMovements";
import type { Movement } from "@/lib/data";
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
}: {
  skus: Opt[];
  locations: Loc[];
  recent: Movement[];
}) {
  const tf = useTranslations("form");
  const tx = useTranslations("xero");

  return (
    <Tabs.Root defaultValue="manual">
      <Tabs.List className="mb-5 flex gap-5 border-b border-border">
        <Tabs.Trigger value="manual" className={triggerCls}>
          <PenLine size={15} />
          {tf("manualEntry")}
        </Tabs.Trigger>
        <Tabs.Trigger value="xero" className={triggerCls}>
          <ReceiptText size={15} />
          {tx("tabImport")}
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content
        value="manual"
        className="grid gap-6 focus:outline-none lg:grid-cols-2"
      >
        <StockOutForm skus={skus} locations={locations} />
        <RecentMovements movements={recent} direction="out" />
      </Tabs.Content>
      <Tabs.Content value="xero" className="focus:outline-none">
        <XeroImportPanel skus={skus} locations={locations} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
